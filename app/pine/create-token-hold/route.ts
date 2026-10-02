import { NextResponse } from "next/server";
import { logConnectorCall } from "@/lib/logger";
import {
  encodeHoldState,
  PineHoldState,
} from "@/lib/pineMock";

export async function POST(request: Request) {
  const startedAt = Date.now();
  let body: any = null;

  function respond(responseBody: unknown, statusCode = 200) {
    logConnectorCall({
      timestamp: new Date().toISOString(),
      connector: "pinelabs_mock",
      endpoint: "/pine/create-token-hold",
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
      property_id,
      property_name,
      tenant_name,
      amount_inr,
      tenant_approved,
      approval_text,
    } = body;

    if (
      !property_id ||
      !property_name ||
      !tenant_name ||
      !Number.isFinite(amount_inr)
    ) {
      return respond(
        {
          success: false,
          code: "INVALID_REQUEST",
          error: "Missing or invalid hold details",
        },
        400
      );
    }

    if (amount_inr <= 0 || amount_inr > 500000) {
      return respond(
        {
          success: false,
          code: "INVALID_AMOUNT",
          error: "Token amount must be between ₹1 and ₹5,00,000",
        },
        400
      );
    }

    if (
      tenant_approved !== true ||
      typeof approval_text !== "string" ||
      approval_text.trim().length === 0
    ) {
      return respond(
        {
          success: false,
          code: "TENANT_APPROVAL_REQUIRED",
          error:
            "Explicit tenant approval is required before creating a token hold",
        },
        409
      );
    }

    const now = new Date().toISOString();

    const state: PineHoldState = {
      hold_id: `HOLD-${crypto.randomUUID()}`,
      property_id,
      property_name,
      tenant_name,
      amount_inr,
      currency: "INR",
      status: "HELD",
      created_at: now,
      updated_at: now,
      approval_text: approval_text.trim(),
    };

    return respond({
      success: true,
      provider: "Pine Labs mock rail",
      capability: "token_hold",
      hold_id: state.hold_id,
      status: state.status,
      amount_inr: state.amount_inr,
      currency: state.currency,
      property_id: state.property_id,
      property_name: state.property_name,
      funds_released_to_owner: false,
      created_at: state.created_at,
      hold_state_token: encodeHoldState(state),
    });
  } catch {
    return respond(
      {
        success: false,
        code: "INTERNAL_ERROR",
        error: "Unable to create token hold",
      },
      500
    );
  }
}