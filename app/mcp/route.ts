import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = createMcpHandler(
  ({ requestInfo }) => {
    const server = new McpServer({
      name: "chaabi-gnani-bridge",
      version: "1.0.0",
    });

    const origin = requestInfo
      ? new URL(requestInfo.url).origin
      : "https://chaabi-rails.vercel.app";

    server.registerTool(
      "start_call",
      {
        description:
          "Trigger a real outbound Gnani voice call to a rental broker. Returns a tracking_id that must be used with call_result to retrieve the resulting conversation.",
        inputSchema: z.object({
          phone: z
            .string()
            .min(10)
            .describe("Broker phone number without the country code"),
          name: z
            .string()
            .optional()
            .describe("Human-readable broker or call label"),
          country_code: z
            .string()
            .optional()
            .default("+91")
            .describe("Phone country code, normally +91"),
        }),
      },
      async ({ phone, name, country_code }) => {
        try {
          const response = await fetch(`${origin}/gnani/start-call`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              phone,
              name: name ?? "Broker",
              countryCode: country_code ?? "+91",
            }),
            cache: "no-store",
          });

          const data = await response.json();

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(data, null, 2),
              },
            ],
            isError: !response.ok || data?.success === false,
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: false,
                  error:
                    error instanceof Error
                      ? error.message
                      : "Unexpected start_call error",
                }),
              },
            ],
            isError: true,
          };
        }
      }
    );

    server.registerTool(
      "call_result",
      {
        description:
          "Retrieve the status and transcript of a Gnani broker call using the tracking_id returned by start_call. If found is false or complete is false, the call result is not ready yet.",
        inputSchema: z.object({
          tracking_id: z
            .string()
            .min(1)
            .describe("Tracking ID returned by start_call"),
        }),
      },
      async ({ tracking_id }) => {
        try {
          const response = await fetch(`${origin}/gnani/call-result`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              tracking_id,
            }),
            cache: "no-store",
          });

          const data = await response.json();

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(data, null, 2),
              },
            ],
            isError: !response.ok || data?.success === false,
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: false,
                  error:
                    error instanceof Error
                      ? error.message
                      : "Unexpected call_result error",
                }),
              },
            ],
            isError: true,
          };
        }
      }
    );

    return server;
  },
  {
    responseMode: "json",
  }
);

export async function POST(request: Request) {
  return handler.fetch(request);
}

export async function GET(request: Request) {
  return handler.fetch(request);
}

export async function DELETE(request: Request) {
  return handler.fetch(request);
}