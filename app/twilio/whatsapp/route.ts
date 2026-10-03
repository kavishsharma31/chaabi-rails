import { after } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cleanAgentReply(value: string) {
  return value
    .replace(/Ã¢Â¹/g, "₹")
    .replace(/â‚¹/g, "₹")
    .trim();
}

function twiml(message: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(message)}</Message>
</Response>`;
}

function extractAgentReply(data: any): string {
  let reply =
    data?.response?.output?.raw_output ||
    data?.response?.output?.final_response ||
    data?.response?.output ||
    data?.response?.final_response ||
    data?.response?.message ||
    null;

  if (!reply) {
    return "";
  }

  if (typeof reply !== "string") {
    reply = JSON.stringify(reply);
  }

  return cleanAgentReply(reply);
}

async function runAgent(
  origin: string,
  sender: string,
  message: string
): Promise<string> {
  const agentResponse = await fetch(
    `${origin}/agenticorg/run`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        task: `You have received this WhatsApp message from the tenant.

Sender: ${sender}
Message: ${message}

Respond directly to the tenant. Keep the response concise and suitable for WhatsApp.`,
      }),
      cache: "no-store",
    }
  );

  const responseText = await agentResponse.text();

  let data: any;

  try {
    data = JSON.parse(responseText);
  } catch {
    data = {
      raw_response: responseText,
    };
  }

  if (!agentResponse.ok) {
    console.error(
      "AgenticOrg background run failed:",
      agentResponse.status,
      data
    );

    return "";
  }

  return extractAgentReply(data);
}

function timeout(ms: number): Promise<null> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(null), ms);
  });
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const message = String(
      formData.get("Body") || ""
    ).trim();

    const sender = String(
      formData.get("From") || ""
    ).trim();

    if (!message) {
      return new Response(
        twiml("Please send me a text message."),
        {
          status: 200,
          headers: {
            "Content-Type":
              "text/xml; charset=utf-8",
          },
        }
      );
    }

    const origin =
      new URL(request.url).origin;

    /*
     * Start the AgenticOrg run immediately.
     *
     * For quick agent runs, we'll still return the
     * real answer directly to WhatsApp.
     *
     * For long-running actions such as Gnani calls,
     * WhatsApp gets an acknowledgement instead of
     * sitting open until AgenticOrg/CloudFront times out.
     */
    const agentPromise = runAgent(
      origin,
      sender,
      message
    );

    /*
     * Critical:
     * keep the AgenticOrg work alive even after we
     * return the Twilio webhook response.
     */
    after(async () => {
      try {
        const finalReply =
          await agentPromise;

        if (finalReply) {
          console.log(
            "Background Chaabi result:",
            finalReply
          );
        }
      } catch (error) {
        console.error(
          "Background Chaabi run error:",
          error
        );
      }
    });

    /*
     * Give fast AgenticOrg requests a short window
     * to return their actual answer.
     *
     * We deliberately do NOT wait anywhere near the
     * long broker-call execution time.
     */
    const quickResult =
      await Promise.race([
        agentPromise,
        timeout(4000),
      ]);

    if (
      typeof quickResult === "string" &&
      quickResult.length > 0
    ) {
      return new Response(
        twiml(quickResult),
        {
          status: 200,
          headers: {
            "Content-Type":
              "text/xml; charset=utf-8",
          },
        }
      );
    }

    /*
     * Long-running agent action.
     *
     * Twilio receives this immediately while the
     * AgenticOrg run continues in after().
     */
    return new Response(
      twiml(
        "Got it. Chaabi has started working on this."
      ),
      {
        status: 200,
        headers: {
          "Content-Type":
            "text/xml; charset=utf-8",
        },
      }
    );
  } catch (error) {
    console.error(
      "Twilio WhatsApp webhook error:",
      error
    );

    return new Response(
      twiml(
        "Chaabi hit an error while processing your message."
      ),
      {
        status: 200,
        headers: {
          "Content-Type":
            "text/xml; charset=utf-8",
        },
      }
    );
  }
}