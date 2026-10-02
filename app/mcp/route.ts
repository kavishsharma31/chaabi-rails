import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = createMcpHandler(
  ({ requestInfo }) => {
    const server = new McpServer({
      name: "chaabi-integrations",
      version: "1.2.0",
    });

    const origin = requestInfo
      ? new URL(requestInfo.url).origin
      : "https://chaabi-rails.vercel.app";

    async function forwardJson(
      endpoint: string,
      body: Record<string, unknown>
    ) {
      try {
        const response = await fetch(`${origin}${endpoint}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          cache: "no-store",
        });

        const data = await response.json();

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(data, null, 2),
            },
          ],
          isError: !response.ok || data?.success === false,
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: false,
                error:
                  error instanceof Error
                    ? error.message
                    : `Unexpected error calling ${endpoint}`,
              }),
            },
          ],
          isError: true,
        };
      }
    }

    // GNANI

    server.registerTool(
      "start_call",
      {
        description:
          "Trigger a real outbound Gnani voice call to a rental broker. Returns a tracking_id that must later be passed to call_result.",
        inputSchema: z.object({
          phone: z.string().min(10),
          name: z.string().optional(),
          country_code: z.string().optional().default("+91"),
        }),
      },
      async ({ phone, name, country_code }) => {
        return forwardJson("/gnani/start-call", {
          phone,
          name: name ?? "Broker",
          countryCode: country_code ?? "+91",
        });
      }
    );

    server.registerTool(
      "call_result",
      {
        description:
          "Retrieve the status and transcript of a Gnani broker call using its tracking_id.",
        inputSchema: z.object({
          tracking_id: z.string().min(1),
        }),
      },
      async ({ tracking_id }) => {
        return forwardJson("/gnani/call-result", {
          tracking_id,
        });
      }
    );

    // DELHIVERY

    server.registerTool(
      "validate_address",
      {
        description:
          "Validate and standardize a rental property address using the Delhivery mock rail.",
        inputSchema: z.object({
          address: z.string().min(1),
        }),
      },
      async ({ address }) => {
        return forwardJson("/validate", {
          address,
        });
      }
    );

    server.registerTool(
      "geocode_address",
      {
        description:
          "Geocode a validated rental property address using the Delhivery mock rail. Returns latitude, longitude and error radius.",
        inputSchema: z.object({
          address: z.string().min(1),
        }),
      },
      async ({ address }) => {
        return forwardJson("/geocode", {
          address,
        });
      }
    );

    server.registerTool(
      "verify_delivery_history",
      {
        description:
          "Check recent Delhivery delivery history for a property address. This is a weak supporting signal only and must not by itself determine whether a property is genuine.",
        inputSchema: z.object({
          address: z.string().min(1),
        }),
      },
      async ({ address }) => {
        return forwardJson("/verify", {
          address,
          months: 12,
        });
      }
    );

    server.registerTool(
      "get_travel_matrix",
      {
        description:
          "Calculate travel distance and time between source and target coordinates using the Delhivery mock rail.",
        inputSchema: z.object({
          sources: z
            .array(z.tuple([z.number(), z.number()]))
            .min(1),
          targets: z
            .array(z.tuple([z.number(), z.number()]))
            .min(1),
        }),
      },
      async ({ sources, targets }) => {
        return forwardJson("/matrix", {
          sources,
          targets,
          travel_mode: "auto",
        });
      }
    );

    server.registerTool(
      "get_route",
      {
        description:
          "Generate a route through two or more ordered geographic coordinates using the Delhivery mock rail.",
        inputSchema: z.object({
          geo_coords: z
            .array(z.tuple([z.number(), z.number()]))
            .min(2),
        }),
      },
      async ({ geo_coords }) => {
        return forwardJson("/route", {
          geo_coords,
          travel_mode: "auto",
          alternate_routes: false,
          traffic_aware: true,
        });
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