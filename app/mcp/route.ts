import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = createMcpHandler(
  ({ requestInfo }) => {
    const server = new McpServer({
      name: "chaabi-integrations",
      version: "1.3.0",
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

    // =========================================================
    // DELHIVERY MOCK RAIL
    // =========================================================

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
          "Check recent Delhivery delivery history for a property address. This is only a weak supporting signal and must not by itself determine whether a property is genuine.",
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

    // =========================================================
    // PINE LABS MOCK RAIL
    // =========================================================

    server.registerTool(
      "create_token_hold",
      {
        description:
          "Create a Pine Labs mock token hold for a rental property. Use only after the tenant has explicitly approved the exact token amount. The funds are held and are NOT released to the owner.",
        inputSchema: z.object({
          property_id: z.string().min(1),
          property_name: z.string().min(1),
          tenant_name: z.string().min(1),
          amount_inr: z.number().positive(),
          tenant_approved: z.boolean(),
          approval_text: z.string().min(1),
        }),
      },
      async ({
        property_id,
        property_name,
        tenant_name,
        amount_inr,
        tenant_approved,
        approval_text,
      }) => {
        return forwardJson("/pine/create-token-hold", {
          property_id,
          property_name,
          tenant_name,
          amount_inr,
          tenant_approved,
          approval_text,
        });
      }
    );

    server.registerTool(
      "get_token_hold_status",
      {
        description:
          "Check the current state of a Pine Labs mock token hold. Pass the hold_state_token returned by the previous Pine tool.",
        inputSchema: z.object({
          hold_state_token: z.string().min(1),
        }),
      },
      async ({ hold_state_token }) => {
        return forwardJson("/pine/token-hold-status", {
          hold_state_token,
        });
      }
    );

    server.registerTool(
      "release_token_on_signing",
      {
        description:
          "Release a held rental token to the owner only after both tenant and owner signatures are confirmed. Never use this tool without evidence of both signatures.",
        inputSchema: z.object({
          hold_state_token: z.string().min(1),
          tenant_signed: z.boolean(),
          owner_signed: z.boolean(),
          signing_reference: z.string().min(1),
        }),
      },
      async ({
        hold_state_token,
        tenant_signed,
        owner_signed,
        signing_reference,
      }) => {
        return forwardJson("/pine/release-token", {
          hold_state_token,
          tenant_signed,
          owner_signed,
          signing_reference,
        });
      }
    );

    server.registerTool(
      "cancel_token_hold",
      {
        description:
          "Cancel a held rental token before it has been released to the owner. Use when the rental deal falls through before signing. Released funds cannot be cancelled through this tool.",
        inputSchema: z.object({
          hold_state_token: z.string().min(1),
          reason: z.string().min(1),
        }),
      },
      async ({ hold_state_token, reason }) => {
        return forwardJson("/pine/cancel-token", {
          hold_state_token,
          reason,
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