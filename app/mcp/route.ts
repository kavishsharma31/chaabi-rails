import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = createMcpHandler(
  ({ requestInfo }) => {
    const server = new McpServer({
      name: "chaabi-integrations",
      version: "1.1.0",
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

    // =========================================================
    // GNANI
    // =========================================================

    server.registerTool(
      "start_call",
      {
        description:
          "Trigger a real outbound Gnani voice call to a rental broker. Returns a tracking_id that must be preserved and later passed to call_result.",
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
          "Retrieve the status and transcript of a Gnani broker call using the tracking_id returned by start_call. If found=false or complete=false, retry this tool rather than creating a duplicate call.",
        inputSchema: z.object({
          tracking_id: z
            .string()
            .min(1)
            .describe("Tracking ID returned by start_call"),
        }),
      },
      async ({ tracking_id }) => {
        return forwardJson("/gnani/call-result", {
          tracking_id,
        });
      }
    );

    // =========================================================
    // DELHIVERY MOCK RAIL
    // =========================================================

    server.registerTool(
  "validate_address",
  {
    description:
      "Validate and standardize a rental property address using the Delhivery mock rail. Use this before relying on an address or attempting to identify duplicate property listings.",
    inputSchema: z.object({
      address: z
        .string()
        .min(1)
        .describe("Rental property address to validate"),
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
          "Geocode a rental property address using the Delhivery mock rail. Returns latitude, longitude and error_radius. Use only after obtaining a sufficiently specific address.",
        inputSchema: z.object({
          address: z
            .string()
            .min(1)
            .describe("Rental property address to geocode"),
          req_id: z
            .string()
            .optional()
            .describe("Property or request identifier used for tracing"),
        }),
      },
      async ({ address, req_id }) => {
        return forwardJson("/geocode", {
          address,
          ...(req_id ? { req_id } : {}),
        });
      }
    );

    server.registerTool(
      "verify_delivery_history",
      {
        description:
          "Check whether Delhivery has recent delivery history for a property address. This is only a weak supporting signal that the address has been serviced; is_verified=false must never by itself be used to call a property fake or reject it.",
        inputSchema: z.object({
          address: z
            .string()
            .min(1)
            .describe("Rental property address to verify"),
          months: z
            .number()
            .int()
            .positive()
            .optional()
            .default(12)
            .describe("Number of months of delivery history to check"),
          req_id: z
            .string()
            .optional()
            .describe("Property or request identifier used for tracing"),
        }),
      },
      async ({ address, months, req_id }) => {
        return forwardJson("/verify", {
          address,
          months: months ?? 12,
          ...(req_id ? { req_id } : {}),
        });
      }
    );

    server.registerTool(
      "get_travel_matrix",
      {
        description:
          "Calculate Delhivery mock travel distance and time from one or more source coordinates to one or more target coordinates. Useful for checking tenant commute or comparing properties.",
        inputSchema: z.object({
          sources: z
            .array(z.tuple([z.number(), z.number()]))
            .min(1)
            .describe(
              "Source coordinates as arrays of [latitude, longitude]"
            ),
          targets: z
            .array(z.tuple([z.number(), z.number()]))
            .min(1)
            .describe(
              "Target coordinates as arrays of [latitude, longitude]"
            ),
          travel_mode: z
            .enum(["auto", "motorcycle", "truck", "pedestrian"])
            .optional()
            .default("auto")
            .describe("Travel mode"),
          route_modifiers: z
            .record(z.string(), z.any())
            .optional()
            .describe("Optional Delhivery routing modifiers"),
        }),
      },
      async ({
        sources,
        targets,
        travel_mode,
        route_modifiers,
      }) => {
        return forwardJson("/matrix", {
          sources,
          targets,
          travel_mode: travel_mode ?? "auto",
          ...(route_modifiers ? { route_modifiers } : {}),
        });
      }
    );

    server.registerTool(
      "get_route",
      {
        description:
          "Generate a Delhivery mock route through ordered geographic waypoints. Use when Chaabi needs route distance, duration, legs or waypoint sequencing for rental visits.",
        inputSchema: z.object({
          geo_coords: z
            .array(z.tuple([z.number(), z.number()]))
            .min(2)
            .describe(
              "Ordered route waypoints as arrays of [latitude, longitude]"
            ),
          travel_mode: z
            .enum(["auto", "motorcycle", "truck", "pedestrian"])
            .optional()
            .default("auto")
            .describe("Travel mode"),
          alternate_routes: z
            .boolean()
            .optional()
            .default(false)
            .describe("Whether alternate routes should be returned"),
          traffic_aware: z
            .boolean()
            .optional()
            .default(true)
            .describe("Whether travel time should account for traffic"),
          departure_time: z
            .string()
            .optional()
            .describe("Optional departure time"),
          route_modifiers: z
            .record(z.string(), z.any())
            .optional()
            .describe("Optional Delhivery routing modifiers"),
        }),
      },
      async ({
        geo_coords,
        travel_mode,
        alternate_routes,
        traffic_aware,
        departure_time,
        route_modifiers,
      }) => {
        return forwardJson("/route", {
          geo_coords,
          travel_mode: travel_mode ?? "auto",
          alternate_routes: alternate_routes ?? false,
          traffic_aware: traffic_aware ?? true,
          ...(departure_time ? { departure_time } : {}),
          ...(route_modifiers ? { route_modifiers } : {}),
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