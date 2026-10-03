import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

type BrokerCallContext = {
  tracking_id?: string;
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

function findTrackingId(value: unknown): string | null {
  if (typeof value === "string") {
    const match = value.match(/chaabi-\d+-[a-z0-9]+/i);
    return match?.[0] ?? null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findTrackingId(item);

      if (found) {
        return found;
      }
    }

    return null;
  }

  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;

    const preferredKeys = [
      "clientReferenceId",
      "client_reference_id",
      "clientReference",
      "client_reference",
      "referenceId",
      "reference_id",
      "tracking_id",
      "trackingId",
    ];

    for (const key of preferredKeys) {
      if (key in object) {
        const found = findTrackingId(object[key]);

        if (found) {
          return found;
        }
      }
    }

    for (const nestedValue of Object.values(object)) {
      const found = findTrackingId(nestedValue);

      if (found) {
        return found;
      }
    }
  }

  return null;
}

function stringifyContextValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.join(" | ");
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (value === null || value === undefined) {
    return "";
  }

  return JSON.stringify(value);
}

async function loadCallContext(
  origin: string,
  trackingId: string
): Promise<BrokerCallContext> {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 7500);

  try {
    const response = await fetch(
      `${origin}/agenticorg/state-worker`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          task: JSON.stringify({
            operation: "read_event",
            event_id: `CALLCTX-${trackingId}`,
          }),
        }),
        cache: "no-store",
        signal: controller.signal,
      }
    );

    const responseText = await response.text();

    let data: any;

    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error(
        `State worker returned non-JSON response: ${responseText}`
      );
    }

    if (!response.ok || data?.success !== true) {
      throw new Error(
        data?.error ??
          `State worker returned HTTP ${response.status}`
      );
    }

    if (data?.found !== true || !data?.event) {
      throw new Error(
        `No persisted call context found for ${trackingId}`
      );
    }

    const inputSummary = data.event.input_summary;

    if (
      !inputSummary ||
      typeof inputSummary !== "string"
    ) {
      throw new Error(
        "Persisted call context has no input_summary"
      );
    }

    let parsedContext: BrokerCallContext;

    try {
      parsedContext = JSON.parse(inputSummary);
    } catch {
      throw new Error(
        "Persisted call context input_summary is not valid JSON"
      );
    }

    return parsedContext;
  } finally {
    clearTimeout(timeout);
  }
}

function buildGnaniResponse(
  trackingId: string,
  context: BrokerCallContext
) {
  const propertyLabel =
    context.property_address ??
    context.property_id ??
    "the rental property";

  const greeting =
    `Hi, this is Chaabi calling on behalf of a tenant about ${propertyLabel}. ` +
    "Is this a good time to speak?";

  const userContext = Object.fromEntries(
    Object.entries({
      tracking_id: trackingId,
      tenant_user_id: context.tenant_user_id,
      policy_id: context.policy_id,
      property_id: context.property_id,
      property_address: context.property_address,
      bhk: context.bhk,
      current_rent_inr: context.current_rent_inr,
      maintenance_inr: context.maintenance_inr,
      deposit_inr: context.deposit_inr,
      possession_date: context.possession_date,
      max_rent_inr: context.max_rent_inr,
      negotiation_target_inr:
        context.negotiation_target_inr,
      preferred_visit_days:
        context.preferred_visit_days,
      previous_learnings:
        context.previous_learnings,
      call_purpose: context.call_purpose,
    })
      .filter(
        ([, value]) =>
          value !== undefined &&
          value !== null &&
          value !== ""
      )
      .map(([key, value]) => [
        key,
        stringifyContextValue(value),
      ])
  );

  return {
    additional_info: {
      inya_data: {
        text: greeting,
        user_context: userContext,
      },
    },
  };
}

async function handleDynamicContext(
  request: Request,
  requestBody?: unknown
) {
  try {
    const url = new URL(request.url);

    const trackingId =
      findTrackingId(requestBody) ??
      findTrackingId(
        url.searchParams.get("clientReferenceId")
      ) ??
      findTrackingId(
        url.searchParams.get("client_reference_id")
      ) ??
      findTrackingId(
        url.searchParams.get("tracking_id")
      );

    if (!trackingId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No Chaabi tracking/client reference ID was supplied",
        },
        { status: 400 }
      );
    }

    const context = await loadCallContext(
      url.origin,
      trackingId
    );

    return NextResponse.json(
      buildGnaniResponse(trackingId, context),
      { status: 200 }
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unexpected dynamic-context error";

    const timedOut =
      error instanceof Error &&
      error.name === "AbortError";

    return NextResponse.json(
      {
        success: false,
        error: timedOut
          ? "Call context lookup exceeded the pre-call time budget"
          : message,
      },
      { status: timedOut ? 504 : 400 }
    );
  }
}

export async function POST(request: Request) {
  let body: unknown = {};

  try {
    body = await request.json();
  } catch {
    body = {};
  }

  return handleDynamicContext(request, body);
}

export async function GET(request: Request) {
  return handleDynamicContext(request);
}