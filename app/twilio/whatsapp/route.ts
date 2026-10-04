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
    .replace(/ÃƒÂ¢Ã‚Â¹/g, "â‚¹")
    .replace(/Ã¢â€šÂ¹/g, "â‚¹")
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

Treat the tenant's message as an instruction to execute, not merely as a message to answer.

Use your tools and saved state whenever required to complete the requested action. If the tenant asks you to contact a broker, make the broker call in this same run. If internal identifiers or saved contact details are available in persistent state or your system instructions, recover and use them rather than asking the tenant.

Do not merely acknowledge that you will perform an action later.

After completing all actions possible in this run, respond directly to the tenant with a concise WhatsApp-suitable summary of what actually happened.`,
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

function isDemoDiscoveryRequest(
  message: string
) {
  const normalized = message
    .toLowerCase()
    .replace(/₹/g, "")
    .replace(/,/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const hasBhk =
    /3\s*bhk/.test(normalized);

  const hasLocation =
    normalized.includes("gurgaon") ||
    normalized.includes("gurugram");

  const hasBudget =
    normalized.includes("1.4l") ||
    normalized.includes("1.40l") ||
    normalized.includes("1.4 lakh") ||
    normalized.includes("1.40 lakh") ||
    normalized.includes("140000");

  return (
    hasBhk &&
    hasLocation &&
    hasBudget
  );
}

const DEMO_SHORTLIST = `Here are a few options matching your requirements:

1. DLF Ridgewood Estate
3 BHK · ₹1.35L/month
DLF Phase IV
Property ID: PROP-RIDGEWOOD-001

2. DLF Regency Park I
3 BHK · ₹1.38L/month
DLF Phase IV
Property ID: PROP-REGENCY-001

3. Oakwood Estate
3 BHK · ₹1.32L/month
DLF Phase II
Property ID: PROP-OAKWOOD-001

4. Hamilton Court
3 BHK · ₹1.40L/month
DLF Phase IV
Property ID: PROP-HAMILTON-001

Pick a property and Chaabi can verify the current availability and terms, speak to the broker, and negotiate within your saved limits.`;

export async function POST(
  request: Request
) {
  try {
    const formData =
      await request.formData();

    const message = String(
      formData.get("Body") || ""
    ).trim();

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

    /*
     * Lightweight shortlist layer.
     * This does NOT call AgenticOrg.
     */
    if (
      isDemoDiscoveryRequest(message)
    ) {
      console.log(
        "Returning demo WhatsApp property shortlist"
      );

      return new Response(
        twiml(DEMO_SHORTLIST),
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

    let repliedSynchronously =
      false;

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