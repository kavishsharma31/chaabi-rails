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
      endpoint: "/pine/cancel-token",
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

    const { hold_state_token, reason } = body;

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

    if (state.status === "RELEASED") {
      return respond(
        {
          success: false,
          code: "ALREADY_RELEASED",
          error:
            "Released funds cannot be cancelled through the hold flow",
          hold_id: state.hold_id,
        },
        409
      );
    }

    if (state.status === "CANCELLED") {
      return respond(
        {
          success: true,
          hold_id: state.hold_id,
          status: "CANCELLED",
          message: "Token hold was already cancelled",
          hold_state_token,
        },
        200
      );
    }

    if (typeof reason !== "string" || reason.trim().length === 0) {
      return respond(
        {
          success: false,
          code: "CANCELLATION_REASON_REQUIRED",
          error: "A cancellation reason is required",
        },
        400
      );
    }

    const updatedState = {
      ...state,
      status: "CANCELLED" as const,
      updated_at: new Date().toISOString(),
      cancellation_reason: reason.trim(),
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
      funds_released_to_owner: false,
      funds_returned_to_tenant: true,
      cancellation_reason: updatedState.cancellation_reason,
      cancelled_at: updatedState.updated_at,
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