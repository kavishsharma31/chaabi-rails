import {
  createMcpHandler,
  McpServer,
} from "@modelcontextprotocol/server";
import * as z from "zod/v4";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const handler = createMcpHandler(
  ({ requestInfo }) => {
    const server = new McpServer({
      name: "chaabi-integrations",
      version: "1.6.0",
    });

    const origin = requestInfo
      ? new URL(requestInfo.url).origin
      : "https://chaabi-rails.vercel.app";

    async function forwardJson(
      endpoint: string,
      body: Record<string, unknown>
    ) {
      try {
        const response = await fetch(
          `${origin}${endpoint}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
            cache: "no-store",
          }
        );

        const data = await response.json();

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                data,
                null,
                2
              ),
            },
          ],
          isError:
            !response.ok ||
            data?.success === false,
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
          "Trigger a real outbound Gnani voice call to a rental broker. Before consequential negotiation calls, supply the known property context and tenant policy so the voice agent can act inside the tenant's limits. Returns a tracking_id that must later be passed to call_result and process_call_outcome.",
        inputSchema: z.object({
          phone: z.string().min(10),
          name: z.string().optional(),
          country_code: z
            .string()
            .optional()
            .default("+91"),

          tenant_user_id: z
            .string()
            .optional(),

          policy_id: z
            .string()
            .optional(),

          property_id: z
            .string()
            .optional(),

          property_address: z
            .string()
            .optional(),

          bhk: z
            .string()
            .optional(),

          current_rent_inr: z
            .number()
            .optional(),

          maintenance_inr: z
            .number()
            .optional(),

          deposit_inr: z
            .number()
            .optional(),

          possession_date: z
            .string()
            .optional(),

          max_rent_inr: z
            .number()
            .optional(),

          negotiation_target_inr: z
            .number()
            .optional(),

          preferred_visit_days: z
            .array(z.string())
            .optional(),

          previous_learnings: z
            .array(z.string())
            .optional(),

          call_purpose: z
            .string()
            .optional(),
        }),
      },
      async ({
        phone,
        name,
        country_code,
        tenant_user_id,
        policy_id,
        property_id,
        property_address,
        bhk,
        current_rent_inr,
        maintenance_inr,
        deposit_inr,
        possession_date,
        max_rent_inr,
        negotiation_target_inr,
        preferred_visit_days,
        previous_learnings,
        call_purpose,
      }) => {
        return forwardJson(
          "/gnani/start-call",
          {
            phone,
            name: name ?? "Broker",
            countryCode:
              country_code ?? "+91",

            tenant_user_id,
            policy_id,
            property_id,
            property_address,
            bhk,
            current_rent_inr,
            maintenance_inr,
            deposit_inr,
            possession_date,
            max_rent_inr,
            negotiation_target_inr,
            preferred_visit_days,
            previous_learnings,
            call_purpose,
          }
        );
      }
    );

    server.registerTool(
      "call_result",
      {
        description:
          "Retrieve the completed Gnani broker call, transcript, disposition and structured post-call extraction using its tracking_id.",
        inputSchema: z.object({
          tracking_id: z
            .string()
            .min(1),
        }),
      },
      async ({ tracking_id }) => {
        return forwardJson(
          "/gnani/call-result",
          {
            tracking_id,
          }
        );
      }
    );

    server.registerTool(
      "process_call_outcome",
      {
        description:
          "Process a completed Gnani broker call into Chaabi's persistent rental state. It loads the original call context, structured Gnani extraction, current property record and tenant policy; detects contradictions; enforces rent limits; updates property state safely; appends an immutable event; and returns whether tenant escalation is required. Use after call_result confirms the call is complete.",
        inputSchema: z.object({
          tracking_id: z
            .string()
            .min(1),
        }),
      },
      async ({ tracking_id }) => {
        return forwardJson(
          "/gnani/process-call",
          {
            tracking_id,
          }
        );
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
        return forwardJson(
          "/validate",
          {
            address,
          }
        );
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
        return forwardJson(
          "/geocode",
          {
            address,
          }
        );
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
        return forwardJson(
          "/verify",
          {
            address,
            months: 12,
          }
        );
      }
    );

    server.registerTool(
      "get_travel_matrix",
      {
        description:
          "Calculate travel distance and time between source and target coordinates using the Delhivery mock rail.",
        inputSchema: z.object({
          sources: z
            .array(
              z.tuple([
                z.number(),
                z.number(),
              ])
            )
            .min(1),

          targets: z
            .array(
              z.tuple([
                z.number(),
                z.number(),
              ])
            )
            .min(1),
        }),
      },
      async ({
        sources,
        targets,
      }) => {
        return forwardJson(
          "/matrix",
          {
            sources,
            targets,
            travel_mode: "auto",
          }
        );
      }
    );

    server.registerTool(
      "get_route",
      {
        description:
          "Generate a route through two or more ordered geographic coordinates using the Delhivery mock rail.",
        inputSchema: z.object({
          geo_coords: z
            .array(
              z.tuple([
                z.number(),
                z.number(),
              ])
            )
            .min(2),
        }),
      },
      async ({ geo_coords }) => {
        return forwardJson(
          "/route",
          {
            geo_coords,
            travel_mode: "auto",
            alternate_routes: false,
            traffic_aware: true,
          }
        );
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
          property_id: z
            .string()
            .min(1),

          property_name: z
            .string()
            .min(1),

          tenant_name: z
            .string()
            .min(1),

          amount_inr: z
            .number()
            .positive(),

          tenant_approved:
            z.boolean(),

          approval_text: z
            .string()
            .min(1),
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
        return forwardJson(
          "/pine/create-token-hold",
          {
            property_id,
            property_name,
            tenant_name,
            amount_inr,
            tenant_approved,
            approval_text,
          }
        );
      }
    );

    server.registerTool(
      "get_token_hold_status",
      {
        description:
          "Check the current state of a Pine Labs mock token hold. Pass the hold_state_token returned by the previous Pine tool.",
        inputSchema: z.object({
          hold_state_token: z
            .string()
            .min(1),
        }),
      },
      async ({
        hold_state_token,
      }) => {
        return forwardJson(
          "/pine/token-hold-status",
          {
            hold_state_token,
          }
        );
      }
    );

    server.registerTool(
      "release_token_on_signing",
      {
        description:
          "Release a held rental token to the owner only after both tenant and owner signatures have been independently verified through get_agreement_status. Never infer or manually invent signature evidence.",
        inputSchema: z.object({
          hold_state_token: z
            .string()
            .min(1),

          tenant_signed:
            z.boolean(),

          owner_signed:
            z.boolean(),

          signing_reference: z
            .string()
            .min(1),
        }),
      },
      async ({
        hold_state_token,
        tenant_signed,
        owner_signed,
        signing_reference,
      }) => {
        return forwardJson(
          "/pine/release-token",
          {
            hold_state_token,
            tenant_signed,
            owner_signed,
            signing_reference,
          }
        );
      }
    );

    server.registerTool(
      "cancel_token_hold",
      {
        description:
          "Cancel a held rental token before it has been released to the owner. Use when the rental deal falls through before signing. Released funds cannot be cancelled through this tool.",
        inputSchema: z.object({
          hold_state_token: z
            .string()
            .min(1),

          reason: z
            .string()
            .min(1),
        }),
      },
      async ({
        hold_state_token,
        reason,
      }) => {
        return forwardJson(
          "/pine/cancel-token",
          {
            hold_state_token,
            reason,
          }
        );
      }
    );

    // =========================================================
    // CHAABI PERSISTENT STATE
    // =========================================================

    server.registerTool(
      "run_state_worker",
      {
        description:
          "Read or update Chaabi's persistent rental state through the connected Google Sheets state worker. Use this when an action depends on previous rental activity, when state must persist across conversations, or after a material action or decision needs to be recorded. Never claim a state change succeeded unless this tool confirms it.",
        inputSchema: z.object({
          task: z
            .string()
            .min(1)
            .describe(
              "Valid JSON string describing the persistent state operation."
            ),
        }),
      },
      async ({ task }) => {
        return forwardJson(
          "/agenticorg/state-worker",
          {
            task,
          }
        );
      }
    );

    // =========================================================
    // RENTAL TRUTH / PROPERTY PROFILE
    // =========================================================

    server.registerTool(
      "get_property_profile",
      {
        description:
          "Retrieve the persisted Rental Truth profile for a property by property_id. Use this before relying on previously known property availability or terms. Treat missing, contested or stale fields as unresolved rather than inventing values.",
        inputSchema: z.object({
          property_id: z
            .string()
            .min(1),
        }),
      },
      async ({ property_id }) => {
        return forwardJson(
          "/agenticorg/state-worker",
          {
            task: JSON.stringify({
              operation:
                "read_state_record",
              tab: "properties",
              key_field:
                "property_id",
              key_value:
                property_id,
            }),
          }
        );
      }
    );

    // =========================================================
    // AGREEMENT STATUS
    // =========================================================

    server.registerTool(
      "get_agreement_status",
      {
        description:
          "Retrieve verified agreement signature status before any held token is released. A token may be released only when this tool returns tenant_signed=true, owner_signed=true, status=fully_signed and release_eligible=true. Use the exact signing_reference returned by this tool; never invent one.",
        inputSchema: z.object({
          agreement_id: z
            .string()
            .min(1),
        }),
      },
      async ({ agreement_id }) => {
        return forwardJson(
          "/agreement/status",
          {
            agreement_id,
          }
        );
      }
    );

    return server;
  },
  {
    responseMode: "json",
  }
);

export async function POST(
  request: Request
) {
  return handler.fetch(request);
}

export async function GET(
  request: Request
) {
  return handler.fetch(request);
}

export async function DELETE(
  request: Request
) {
  return handler.fetch(request);
}