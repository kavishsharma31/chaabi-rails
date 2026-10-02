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
    .replace(/â¹/g, "₹")
    .trim();
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const message = String(formData.get("Body") || "").trim();
    const sender = String(formData.get("From") || "").trim();

    if (!message) {
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Please send me a text message.</Message>
</Response>`,
        {
          status: 200,
          headers: {
            "Content-Type": "text/xml; charset=utf-8",
          },
        }
      );
    }

    const origin = new URL(request.url).origin;

    const agentResponse = await fetch(`${origin}/agenticorg/run`, {
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
    });

    const data = await agentResponse.json();

    let reply =
      data?.response?.output?.raw_output ||
      data?.response?.output?.final_response ||
      data?.response?.output ||
      "I couldn't process that message.";

    if (typeof reply !== "string") {
      reply = JSON.stringify(reply);
    }

    reply = cleanAgentReply(reply);

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(reply)}</Message>
</Response>`;

    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
      },
    });
  } catch (error) {
    console.error("Twilio WhatsApp webhook error:", error);

    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Chaabi hit an error while processing your message.</Message>
</Response>`,
      {
        status: 200,
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
        },
      }
    );
  }
}