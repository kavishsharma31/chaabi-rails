import { NextResponse } from "next/server";
import { logConnectorCall } from "@/lib/logger";
import {
  decodeHoldState,
  encodeHoldState,
} from "@/lib/pineMock";

export async function POST(request: Request) {
  const startedAt = Date.now();
  let body: any = null;

  function respond(responseBody: unknown, statusCode = 200) {
    logConnectorCall({
      timestamp: new Date().toISOString(),
      connector: "pinelabs_mock",
      endpoint: "/pine/release-token",
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

    const {
      hold_state_token,
      tenant_signed,
      owner_signed,
      signing_reference,
    } = body;

    if (!hold_state_token) {
      return respond(
        {
          success: false,
          code: "MISSING_HOLD_STATE",
          error: "hold_state_token is required",
        },
        400
      );
    }

    const state = decodeHoldState(hold_state_token);

    if (state.status !== "HELD") {
      return respond(
        {
          success: false,
          code: "INVALID_HOLD_STATUS",
          error: `Cannot release a hold with status ${state.status}`,
          hold_id: state.hold_id,
        },
        409
      );
    }

    if (
      tenant_signed !== true ||
      owner_signed !== true ||
      typeof signing_reference !== "string" ||
      signing_reference.trim().length === 0
    ) {
      return respond(
        {
          success: false,
          code: "SIGNATURES_REQUIRED",
          error:
            "Both tenant and owner signatures must be confirmed before release",
          hold_id: state.hold_id,
          status: state.status,
        },
        409
      );
    }

    const updatedState = {
      ...state,
      status: "RELEASED" as const,
      updated_at: new Date().toISOString(),
      signing_reference: signing_reference.trim(),
    };

    return respond({
      success: true,
      provider: "Pine Labs mock rail",
      hold_id: updatedState.hold_id,
      previous_status: state.status,
      status: updatedState.status,
      amount_inr: updatedState.amount_inr,
      currency: updatedState.currency,
      property_id: updatedState.property_id,
      property_name: updatedState.property_name,
      funds_released_to_owner: true,
      signing_reference: updatedState.signing_reference,
      released_at: updatedState.updated_at,
      hold_state_token: encodeHoldState(updatedState),
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