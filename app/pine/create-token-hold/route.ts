import {
  NextResponse,
  after,
} from "next/server";

import {
  logConnectorCall,
} from "@/lib/logger";

import {
  encodeHoldState,
} from "@/lib/pineMock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function appendPropertyStateNote(
  origin: string,
  propertyId: string,
  state: Record<string, unknown>
) {
  const readTask = {
    operation: "read_state_record",
    tab: "properties",
    key_field: "property_id",
    key_value: propertyId,
  };

  const readResponse = await fetch(
    `${origin}/agenticorg/state-worker`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify({
        task: JSON.stringify(
          readTask
        ),
      }),
      cache: "no-store",
    }
  );

  const readData =
    await readResponse.json();

  if (
    !readResponse.ok ||
    readData?.success !== true ||
    !readData?.record
  ) {
    throw new Error(
      "Could not read property before persisting token state"
    );
  }

  const existingNotes = String(
    readData.record.notes ?? ""
  ).trim();

  const marker =
    `[CHAABI_STATE] ${JSON.stringify(
      state
    )}`;

  const notes = existingNotes
    ? `${existingNotes}\n${marker}`
    : marker;

  const updateTask = {
    operation: "upsert_state_record",
    tab: "properties",
    key_field: "property_id",
    key_value: propertyId,
    fields: {
      notes,
    },
  };

  const updateResponse = await fetch(
    `${origin}/agenticorg/state-worker`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify({
        task: JSON.stringify(
          updateTask
        ),
      }),
      cache: "no-store",
    }
  );

  const updateData =
    await updateResponse.json();

  if (
    !updateResponse.ok ||
    updateData?.success !== true
  ) {
    throw new Error(
      "Could not persist token continuity state"
    );
  }
}

export async function POST(
  request: Request
) {
  const startedAt = Date.now();

  let body: any = null;

  function respond(
    responseBody: unknown,
    statusCode = 200
  ) {
    logConnectorCall({
      timestamp:
        new Date().toISOString(),
      connector: "pinelabs_mock",
      endpoint:
        "/pine/create-token-hold",
      method: "POST",
      request: body,
      response: responseBody,
      status_code: statusCode,
      latency_ms:
        Date.now() - startedAt,
    });

    return NextResponse.json(
      responseBody,
      {
        status: statusCode,
      }
    );
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
          error:
            "Missing or invalid hold details",
        },
        400
      );
    }

    if (
      amount_inr <= 0 ||
      amount_inr > 500000
    ) {
      return respond(
        {
          success: false,
          code: "INVALID_AMOUNT",
          error:
            "Token amount must be between ₹1 and ₹5,00,000",
        },
        400
      );
    }

    if (
      tenant_approved !== true ||
      typeof approval_text !==
        "string" ||
      approval_text.trim().length ===
        0
    ) {
      return respond(
        {
          success: false,
          code:
            "TENANT_APPROVAL_REQUIRED",
          error:
            "Explicit tenant approval is required before creating a token hold",
        },
        409
      );
    }

    const hold_id =
      `HOLD-${crypto.randomUUID()}`;

    const created_at =
      new Date().toISOString();

    const hold_state_token =
      encodeHoldState({
        hold_id,
        status: "HELD",
      });

    const origin =
      new URL(request.url).origin;

    /*
     * Persist after returning the Pine
     * result so AgenticOrg is not held up
     * by the Google Sheets write.
     */
    after(async () => {
      try {
        await appendPropertyStateNote(
          origin,
          property_id,
          {
            kind: "token_hold",
            hold_id,
            hold_state_token,
            status: "HELD",
            amount_inr,
            created_at,
          }
        );
      } catch (error) {
        console.error(
          "Failed to persist token hold state:",
          error
        );
      }
    });

    return respond({
      success: true,
      provider:
        "Pine Labs mock rail",
      capability: "token_hold",

      hold_id,
      status: "HELD",

      amount_inr,
      currency: "INR",

      property_id,
      property_name,
      tenant_name,

      funds_released_to_owner:
        false,

      created_at,
      hold_state_token,

      continuity_persistence_scheduled:
        true,
    });
  } catch {
    return respond(
      {
        success: false,
        code: "INTERNAL_ERROR",
        error:
          "Unable to create token hold",
      },
      500
    );
  }
}