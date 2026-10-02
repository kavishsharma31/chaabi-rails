import { NextResponse } from "next/server";
import { logConnectorCall } from "@/lib/logger";
import { decodeHoldState } from "@/lib/pineMock";

export async function POST(request: Request) {
  const startedAt = Date.now();
  let body: any = null;

  function respond(responseBody: unknown, statusCode = 200) {
    logConnectorCall({
      timestamp: new Date().toISOString(),
      connector: "pinelabs_mock",
      endpoint: "/pine/token-hold-status",
      method: "POST",
      request: body,
      response: responseBody,
      status_code: statusCode,
      latency_ms: Date.now() - startedAt,
    });

    return NextResponse.json(responseBody, {
      status: statusCode,
    });
  }

  try {
    body = await request.json();

    if (!body?.hold_state_token) {
      return respond(
        {
          success: false,
          code: "MISSING_HOLD_STATE",
          error: "hold_state_token is required",
        },
        400
      );
    }

    const state = decodeHoldState(body.hold_state_token);

    return respond({
      success: true,
      provider: "Pine Labs mock rail",
      hold_id: state.hold_id,
      status: state.status,
      amount_inr: state.amount_inr,
      currency: state.currency,
      property_id: state.property_id,
      property_name: state.property_name,
      tenant_name: state.tenant_name,
      funds_released_to_owner: state.status === "RELEASED",
      created_at: state.created_at,
      updated_at: state.updated_at,
      signing_reference: state.signing_reference ?? null,
      cancellation_reason: state.cancellation_reason ?? null,
      hold_state_token: body.hold_state_token,
    });
  } catch (error) {
    return respond(
      {
        success: false,
        code: "INVALID_HOLD_STATE",
        error:
          error instanceof Error
            ? error.message
            : "Invalid hold state",
      },
      400
    );
  }
}