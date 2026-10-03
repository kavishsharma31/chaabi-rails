import { NextResponse } from "next/server";
import { logConnectorCall } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BOT_ID = "8721446034a74eb89dc8caef3e5fe454";

type BrokerCallContext = {
  tenant_user_id?: string;
  policy_id?: string;
  property_id?: string;
  property_address?: string;
  bhk?: string;
  current_rent_inr?: number;
  maintenance_inr?: number;
  deposit_inr?: number;
  possession_date?: string;
  max_rent_inr?: number;
  negotiation_target_inr?: number;
  preferred_visit_days?: string[];
  previous_learnings?: string[];
  call_purpose?: string;
};

async function persistCallContext(
  origin: string,
  trackingId: string,
  context: BrokerCallContext
) {
  const eventId = `CALLCTX-${trackingId}`;

  const task = {
    operation: "append_event",
    event_id: eventId,
    run_id: trackingId,
    timestamp: new Date().toISOString(),
    actor: "Chaabi",
    connector: "gnani",
    action: "prepare_broker_call_context",
    entity_type: context.property_id ? "property" : "broker_call",
    entity_id: context.property_id ?? trackingId,
    input_summary: JSON.stringify({
      tracking_id: trackingId,
      ...context,
    }),
    output_summary:
      "Broker call context prepared for Gnani pre-call retrieval.",
    status: "prepared",
  };

  const response = await fetch(
    `${origin}/agenticorg/state-worker`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        task: JSON.stringify(task),
      }),
      cache: "no-store",
    }
  );

  const responseText = await response.text();

  let responseData: any;

  try {
    responseData = JSON.parse(responseText);
  } catch {
    responseData = {
      raw_response: responseText,
    };
  }

  if (!response.ok || responseData?.success !== true) {
    throw new Error(
      `Failed to persist broker call context: ${
        responseData?.error ??
        responseData?.raw_response ??
        `HTTP ${response.status}`
      }`
    );
  }

  return {
    event_id: eventId,
    state_result: responseData,
  };
}

export async function POST(request: Request) {
  const startedAt = Date.now();

  try {
    const bearer = process.env.GNANI_BEARER;

    if (!bearer) {
      return NextResponse.json(
        {
          success: false,
          error: "GNANI_BEARER is not configured",
        },
        { status: 500 }
      );
    }

    const body = await request.json();

    const {
      phone,
      name,
      countryCode = "+91",

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
    } = body;

    if (!phone) {
      return NextResponse.json(
        {
          success: false,
          error: "phone is required",
        },
        { status: 400 }
      );
    }

    const authorization = bearer.startsWith("Bearer ")
      ? bearer
      : `Bearer ${bearer}`;

    const trackingId = `chaabi-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    const gnaniName = `${name ?? "Broker"} | ${trackingId}`;

    const context: BrokerCallContext = {
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
    };

    const cleanedContext = Object.fromEntries(
      Object.entries(context).filter(
        ([, value]) =>
          value !== undefined &&
          value !== null &&
          value !== ""
      )
    ) as BrokerCallContext;

    let contextEventId: string | null = null;

    if (Object.keys(cleanedContext).length > 0) {
      const origin = new URL(request.url).origin;

      const persisted = await persistCallContext(
        origin,
        trackingId,
        cleanedContext
      );

      contextEventId = persisted.event_id;
    }

    const gnaniBody: Record<string, unknown> = {
      phone,
      name: gnaniName,
      countryCode,
      clientReferenceId: trackingId,
    };

    const gnaniResponse = await fetch(
      `https://api.inya.ai/genbots/trigger_call/v3/${BOT_ID}?environment=production`,
      {
        method: "POST",
        headers: {
          Authorization: authorization,
          "X-Organization-Id": "common",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(gnaniBody),
        cache: "no-store",
      }
    );

    const responseText = await gnaniResponse.text();

    let responseData: any;

    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = {
        raw_response: responseText,
      };
    }

    logConnectorCall({
      timestamp: new Date().toISOString(),
      connector: "gnani",
      endpoint: "/trigger_call/v3",
      method: "POST",
      request: {
        ...gnaniBody,
        phone: "[redacted]",
        context_event_id: contextEventId,
      },
      response: responseData,
      status_code: gnaniResponse.status,
      latency_ms: Date.now() - startedAt,
    });

    if (!gnaniResponse.ok) {
      return NextResponse.json(
        {
          success: false,
          tracking_id: trackingId,
          context_event_id: contextEventId,
          gnani_status: gnaniResponse.status,
          error: responseData,
        },
        { status: gnaniResponse.status }
      );
    }

    return NextResponse.json({
      success: true,
      tracking_id: trackingId,
      client_reference_id: trackingId,
      context_event_id: contextEventId,
      context_persisted: contextEventId !== null,
      gnani_name: gnaniName,
      message: responseData?.message ?? "Call triggered",
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unexpected server error",
      },
      { status: 500 }
    );
  }
}