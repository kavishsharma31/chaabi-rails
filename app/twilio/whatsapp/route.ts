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

async function sendWhatsAppMessage(
  from: string,
  to: string,
  body: string
) {
  const accountSid =
    process.env.TWILIO_ACCOUNT_SID;

  const authToken =
    process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    console.error(
      "Twilio outbound credentials are not configured"
    );
    return false;
  }

  const form = new URLSearchParams();

  form.set("From", from);
  form.set("To", to);
  form.set("Body", body);

  const authorization =
    Buffer.from(
      `${accountSid}:${authToken}`
    ).toString("base64");

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization:
          `Basic ${authorization}`,
        "Content-Type":
          "application/x-www-form-urlencoded",
      },
      body: form.toString(),
      cache: "no-store",
    }
  );

  const responseText =
    await response.text();

  if (!response.ok) {
    console.error(
      "Twilio outbound WhatsApp failed:",
      response.status,
      responseText
    );

    return false;
  }

  console.log(
    "Outbound WhatsApp sent successfully"
  );

  return true;
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

  const responseText =
    await agentResponse.text();

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

function timeout(
  ms: number
): Promise<null> {
  return new Promise((resolve) => {
    setTimeout(
      () => resolve(null),
      ms
    );
  });
}

export async function POST(
  request: Request
) {
  try {
    const formData =
      await request.formData();

    const message = String(
      formData.get("Body") || ""
    ).trim();

    /*
     * Incoming WhatsApp addresses from
     * Twilio already look like:
     *
     * whatsapp:+91...
     */
    const sender = String(
      formData.get("From") || ""
    ).trim();

    const twilioWhatsAppSender =
      String(
        formData.get("To") || ""
      ).trim();

    if (!message) {
      return new Response(
        twiml(
          "Please send me a text message."
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

    if (
      !sender ||
      !twilioWhatsAppSender
    ) {
      return new Response(
        twiml(
          "Chaabi couldn't identify the WhatsApp conversation."
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

    const origin =
      new URL(request.url).origin;

    const agentPromise =
      runAgent(
        origin,
        sender,
        message
      );

    /*
     * True only if we already returned
     * Chaabi's real response through
     * the original Twilio webhook.
     */
    let repliedSynchronously =
      false;

    /*
     * Continue waiting for AgenticOrg
     * after the Twilio webhook response
     * has already been returned.
     */
    after(async () => {
      try {
        const finalReply =
          await agentPromise;

        if (
          repliedSynchronously ||
          !finalReply
        ) {
          return;
        }

        /*
         * The user's incoming From becomes
         * our outbound To.
         *
         * Twilio's incoming To becomes
         * our outbound From.
         */
        await sendWhatsAppMessage(
          twilioWhatsAppSender,
          sender,
          finalReply
        );
      } catch (error) {
        console.error(
          "Background Chaabi run/send error:",
          error
        );
      }
    });

    /*
     * Give simple requests four seconds.
     * If Chaabi answers quickly, send the
     * real answer as the normal webhook
     * response.
     */
    const quickResult =
      await Promise.race([
        agentPromise,
        timeout(4000),
      ]);

    if (
      typeof quickResult ===
        "string" &&
      quickResult.length > 0
    ) {
      repliedSynchronously = true;

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
     * Long-running request:
     * acknowledge immediately.
     *
     * after() will send the real answer
     * as a second outbound WhatsApp
     * message once AgenticOrg completes.
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