import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type StateRecord = Record<string, any>;

type Contradiction = {
  field: string;
  persisted: any;
  broker: any;
};

const MONTHS: Record<string, string> = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
};

const DAY_WORDS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  eleventh: 11,
  twelfth: 12,
  thirteenth: 13,
  fourteenth: 14,
  fifteenth: 15,
  sixteenth: 16,
  seventeenth: 17,
  eighteenth: 18,
  nineteenth: 19,
  twentieth: 20,
  "twenty first": 21,
  "twenty-first": 21,
  "twenty second": 22,
  "twenty-second": 22,
  "twenty third": 23,
  "twenty-third": 23,
  "twenty fourth": 24,
  "twenty-fourth": 24,
  "twenty fifth": 25,
  "twenty-fifth": 25,
  "twenty sixth": 26,
  "twenty-sixth": 26,
  "twenty seventh": 27,
  "twenty-seventh": 27,
  "twenty eighth": 28,
  "twenty-eighth": 28,
  "twenty ninth": 29,
  "twenty-ninth": 29,
  thirtieth: 30,
  "thirty first": 31,
  "thirty-first": 31,
};

function asNumber(value: any): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const numeric =
    typeof value === "number"
      ? value
      : Number(
          String(value)
            .replace(/,/g, "")
            .trim()
        );

  return Number.isFinite(numeric)
    ? numeric
    : null;
}

function asPositiveNumber(value: any): number | null {
  const numeric = asNumber(value);

  // Gnani may emit 0 for an unextracted optional money field.
  // In rental terms, zero here means "unknown / not extracted",
  // not an authoritative broker quote.
  if (numeric === null || numeric <= 0) {
    return null;
  }

  return numeric;
}

function isEmpty(value: any) {
  return (
    value === null ||
    value === undefined ||
    String(value).trim() === ""
  );
}

function sameValue(a: any, b: any) {
  const aNumber = asNumber(a);
  const bNumber = asNumber(b);

  if (aNumber !== null && bNumber !== null) {
    return aNumber === bNumber;
  }

  return (
    String(a ?? "")
      .trim()
      .toLowerCase() ===
    String(b ?? "")
      .trim()
      .toLowerCase()
  );
}

function parsePolicyValue(value: any) {
  if (!value) {
    return null;
  }

  if (typeof value === "object") {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizePossessionDate(
  value: any,
  fallbackYear: number
): string | null {
  if (!value || typeof value !== "string") {
    return null;
  }

  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return cleaned;
  }

  for (const [
    monthName,
    monthNumber,
  ] of Object.entries(MONTHS)) {
    if (!cleaned.includes(monthName)) {
      continue;
    }

    let day: number | null = null;

    const numericMatch = cleaned.match(
      /\b([1-9]|[12]\d|3[01])(?:st|nd|rd|th)?\b/
    );

    if (numericMatch) {
      day = Number(numericMatch[1]);
    } else {
      const dayEntry = Object.entries(
        DAY_WORDS
      ).find(([word]) =>
        cleaned.includes(word)
      );

      if (dayEntry) {
        day = dayEntry[1];
      }
    }

    if (!day) {
      return null;
    }

    return `${fallbackYear}-${monthNumber}-${String(
      day
    ).padStart(2, "0")}`;
  }

  return null;
}

function persistedAvailability(
  status: any
): boolean | null {
  const value = String(status ?? "")
    .trim()
    .toLowerCase();

  if (!value) {
    return null;
  }

  if (value.includes("unavailable")) {
    return false;
  }

  if (value.includes("available")) {
    return true;
  }

  return null;
}

async function stateWorker(
  origin: string,
  task: Record<string, any>
) {
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

  const text = await response.text();

  let data: any;

  try {
    data = JSON.parse(text);
  } catch {
    data = {
      success: false,
      error: text,
    };
  }

  if (!response.ok || data?.success !== true) {
    throw new Error(
      data?.error ??
        `State worker failed with HTTP ${response.status}`
    );
  }

  return data;
}

async function getCallResult(
  origin: string,
  trackingId: string
) {
  const response = await fetch(
    `${origin}/gnani/call-result`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tracking_id: trackingId,
      }),
      cache: "no-store",
    }
  );

  const text = await response.text();

  let data: any;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `Call result returned non-JSON response: ${text}`
    );
  }

  if (!response.ok || data?.success !== true) {
    throw new Error(
      data?.error ??
        `Call result failed with HTTP ${response.status}`
    );
  }

  return data;
}

function brokerTranscriptOnly(
  transcript: any[]
): string {
  if (!Array.isArray(transcript)) {
    return "";
  }

  return transcript
    .filter(
      (turn) =>
        turn?.role === "user" &&
        typeof turn?.content === "string"
    )
    .map((turn) => turn.content)
    .join(" ")
    .toLowerCase();
}

function normalizeExtraction(
  extraction: any,
  transcript: any[]
) {
  const brokerText =
    brokerTranscriptOnly(transcript);

  const rawFinalRent =
    asPositiveNumber(
      extraction?.finalRentInr
    );

  // Gnani can occasionally classify an asking price as finalRentInr.
  // For consequential rent decisions, require the broker to actually
  // express finality in their own speech.
  const brokerExpressedFinality =
    /\b(final|lowest|minimum|best|last)\b/i.test(
      brokerText
    );

  const finalRent =
    brokerExpressedFinality
      ? rawFinalRent
      : null;

  let ownerConfirmationRequired =
    String(
      extraction?.ownerConfirmationRequired ??
        "UNCLEAR"
    ).toUpperCase();

  if (ownerConfirmationRequired === "YES") {
    const brokerActuallyRequestedOwnerCheck =
      /(?:check|confirm|ask|speak|talk).{0,40}\bowner\b/i.test(
        brokerText
      ) ||
      /\bowner\b.{0,40}(?:check|confirm|ask|speak|talk)/i.test(
        brokerText
      );

    if (!brokerActuallyRequestedOwnerCheck) {
      ownerConfirmationRequired = "UNCLEAR";
    }
  }

  return {
    disposition:
      extraction?.DISPOSITION ?? null,

    property_available:
      extraction?.propertyAvailable ?? null,

    final_rent_inr:
      finalRent,

    raw_extracted_final_rent_inr:
      rawFinalRent,

    final_rent_confirmed:
      brokerExpressedFinality &&
      rawFinalRent !== null,

    maintenance_inr:
      asPositiveNumber(
        extraction?.maintenanceInr
      ),

    deposit_inr:
      asPositiveNumber(
        extraction?.depositInr
      ),

    brokerage_inr:
      asPositiveNumber(
        extraction?.brokerageInr
      ),

    possession_date_raw:
      isEmpty(extraction?.possessionDate)
        ? null
        : extraction.possessionDate,

    occupancy_status:
      extraction?.occupancyStatus ?? null,

    visit_status:
      extraction?.visitStatus ?? null,

    owner_confirmation_required:
      ownerConfirmationRequired,

    callback_requested:
      extraction?.callbackRequested ?? null,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const trackingId = body?.tracking_id;

    if (!trackingId) {
      return NextResponse.json(
        {
          success: false,
          error: "tracking_id is required",
        },
        { status: 400 }
      );
    }

    const origin = new URL(request.url).origin;

    const outcomeEventId =
      `BROKEROUTCOME-${trackingId}`;

    // =========================================================
    // IDEMPOTENCY CHECK
    // =========================================================

    const previousOutcome =
      await stateWorker(origin, {
        operation: "read_event",
        event_id: outcomeEventId,
      });

    if (previousOutcome?.found) {
      return NextResponse.json({
        success: true,
        already_processed: true,
        tracking_id: trackingId,
        event: previousOutcome.event,
      });
    }

    // =========================================================
    // LOAD COMPLETED GNANI CALL
    // =========================================================

    const callResult =
      await getCallResult(
        origin,
        trackingId
      );

    if (!callResult?.found) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Gnani conversation has not appeared yet",
          tracking_id: trackingId,
        },
        { status: 409 }
      );
    }

    if (!callResult?.complete) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Gnani conversation is not complete yet",
          tracking_id: trackingId,
        },
        { status: 409 }
      );
    }

    if (
      !callResult?.post_call_extraction ||
      typeof callResult.post_call_extraction !==
        "object"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No structured post-call extraction is available",
          tracking_id: trackingId,
          overall_call_disposition:
            callResult?.overall_call_disposition ??
            null,
        },
        { status: 422 }
      );
    }

    // =========================================================
    // LOAD CALL CONTEXT
    // =========================================================

    const contextEvent =
      await stateWorker(origin, {
        operation: "read_event",
        event_id: `CALLCTX-${trackingId}`,
      });

    if (
      !contextEvent?.found ||
      !contextEvent?.event
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Persisted call context was not found",
          tracking_id: trackingId,
        },
        { status: 404 }
      );
    }

    let callContext: any;

    try {
      callContext = JSON.parse(
        contextEvent.event.input_summary
      );
    } catch {
      return NextResponse.json(
        {
          success: false,
          error:
            "Persisted call context is invalid JSON",
          tracking_id: trackingId,
        },
        { status: 500 }
      );
    }

    const propertyId =
      callContext?.property_id;

    if (!propertyId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Call context does not contain property_id",
          tracking_id: trackingId,
        },
        { status: 422 }
      );
    }

    // =========================================================
    // LOAD CURRENT PROPERTY STATE
    // =========================================================

    const propertyResult =
      await stateWorker(origin, {
        operation: "read_state_record",
        tab: "properties",
        key_field: "property_id",
        key_value: propertyId,
      });

    if (
      !propertyResult?.found ||
      !propertyResult?.record
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Property state was not found",
          property_id: propertyId,
        },
        { status: 404 }
      );
    }

    const property: StateRecord =
      propertyResult.record;

    // =========================================================
    // LOAD AUTHORITATIVE TENANT POLICY
    // =========================================================

    const policyId =
      callContext?.policy_id;

    let policy: any = null;

    if (policyId) {
      const policyResult =
        await stateWorker(origin, {
          operation: "read_state_record",
          tab: "permissions",
          key_field: "permission_id",
          key_value: policyId,
        });

      if (
        policyResult?.found &&
        policyResult?.record &&
        String(
          policyResult.record.enabled
        ).toUpperCase() === "TRUE"
      ) {
        policy = parsePolicyValue(
          policyResult.record.value
        );
      }
    }

    // =========================================================
    // NORMALIZE GNANI EXTRACTION
    // =========================================================

    const extracted =
      normalizeExtraction(
        callResult.post_call_extraction,
        callResult.transcript
      );

    const storedYearMatch =
      String(
        property.possession_date ?? ""
      ).match(/^(\d{4})-/);

    const fallbackYear =
      storedYearMatch
        ? Number(storedYearMatch[1])
        : new Date().getFullYear();

    const normalizedPossessionDate =
      normalizePossessionDate(
        extracted.possession_date_raw,
        fallbackYear
      );

    // =========================================================
    // CONTRADICTION CHECK
    // =========================================================

    const contradictions: Contradiction[] =
      [];

    const compareField = (
      field: string,
      persistedValue: any,
      brokerValue: any
    ) => {
      if (
        brokerValue === null ||
        brokerValue === undefined ||
        brokerValue === ""
      ) {
        return;
      }

      if (isEmpty(persistedValue)) {
        return;
      }

      if (
        !sameValue(
          persistedValue,
          brokerValue
        )
      ) {
        contradictions.push({
          field,
          persisted: persistedValue,
          broker: brokerValue,
        });
      }
    };

    compareField(
      "rent",
      property.rent,
      extracted.final_rent_inr
    );

    compareField(
      "maintenance",
      property.maintenance,
      extracted.maintenance_inr
    );

    compareField(
      "deposit",
      property.deposit,
      extracted.deposit_inr
    );

    if (normalizedPossessionDate) {
      compareField(
        "possession_date",
        property.possession_date,
        normalizedPossessionDate
      );
    }

    const oldAvailability =
      persistedAvailability(
        property.status
      );

    const brokerAvailability =
      String(
        extracted.property_available ?? ""
      ).toUpperCase();

    if (
      oldAvailability !== null &&
      (brokerAvailability === "YES" ||
        brokerAvailability === "NO")
    ) {
      const brokerAvailable =
        brokerAvailability === "YES";

      if (
        oldAvailability !==
        brokerAvailable
      ) {
        contradictions.push({
          field: "availability",
          persisted: oldAvailability
            ? "available"
            : "unavailable",
          broker: brokerAvailable
            ? "available"
            : "unavailable",
        });
      }
    }

    // =========================================================
    // L3 POLICY / ESCALATION CHECK
    // =========================================================

    const maxRent =
      asNumber(
        policy?.max_monthly_rent_inr
      ) ??
      asNumber(
        callContext?.max_rent_inr
      );

    const finalRent =
      extracted.final_rent_inr;

    const aboveCeiling =
      finalRent !== null &&
      maxRent !== null &&
      finalRent > maxRent;

    // A broker rent variance that is still within the tenant's
    // authorized ceiling is not, by itself, an L3 approval boundary.
    // We log it as a contradiction/variance and preserve the canonical
    // owner-confirmed value, but Chaabi may continue autonomously.
    const blockingContradictions =
      contradictions.filter((item) => {
        if (
          item.field === "rent" &&
          !aboveCeiling
        ) {
          return false;
        }

        return true;
      });

    const escalationRequired =
      aboveCeiling ||
      blockingContradictions.length > 0;

    const escalationReasons: string[] =
      [];

    if (aboveCeiling) {
      escalationReasons.push(
        `Broker final rent ₹${finalRent} exceeds tenant ceiling ₹${maxRent}.`
      );
    }

    if (
      blockingContradictions.length > 0
    ) {
      escalationReasons.push(
        `Broker information conflicts with ${blockingContradictions.length} persisted property field(s) requiring tenant review.`
      );
    }

    // =========================================================
    // SAFE PROPERTY STATE UPDATE
    //
    // Do NOT overwrite owner-confirmed canonical values
    // when a broker contradicts them.
    // =========================================================

    const nowIso =
      new Date().toISOString();

    const fields: Record<
      string,
      string | number | boolean | null
    > = {
      last_verified_at: nowIso,
    };

    const hasContradiction = (
      field: string
    ) =>
      contradictions.some(
        (item) =>
          item.field === field
      );

    if (
      isEmpty(property.rent) &&
      finalRent !== null
    ) {
      fields.rent = finalRent;
    }

    if (
      isEmpty(property.maintenance) &&
      extracted.maintenance_inr !== null
    ) {
      fields.maintenance =
        extracted.maintenance_inr;
    }

    if (
      isEmpty(property.deposit) &&
      extracted.deposit_inr !== null
    ) {
      fields.deposit =
        extracted.deposit_inr;
    }

    if (
      isEmpty(property.possession_date) &&
      normalizedPossessionDate
    ) {
      fields.possession_date =
        normalizedPossessionDate;
    }

    if (
      escalationRequired &&
      contradictions.length > 0
    ) {
      fields.status =
        aboveCeiling
          ? "contested_terms_above_budget"
          : "contested_broker_update";
    } else if (
      brokerAvailability === "NO"
    ) {
      fields.status =
        "unavailable_broker_confirmed";
    } else if (
      brokerAvailability === "YES"
    ) {
      if (
        String(
          property.status ?? ""
        ).includes("owner_confirmed")
      ) {
        fields.status =
          aboveCeiling
            ? "available_owner_confirmed_broker_above_budget"
            : hasContradiction("rent")
              ? "available_owner_confirmed_broker_variance_within_limits"
              : "available_owner_confirmed_broker_reconfirmed";
      } else {
        fields.status =
          aboveCeiling
            ? "available_broker_confirmed_above_budget"
            : hasContradiction("rent")
              ? "available_broker_variance_within_limits"
              : "available_broker_confirmed";
      }
    }

    const brokerFacts = {
      conversation_id:
        callResult.conversation_id,
      disposition:
        extracted.disposition,
      property_available:
        extracted.property_available,
      final_rent_inr:
        extracted.final_rent_inr,
      raw_extracted_final_rent_inr:
        extracted.raw_extracted_final_rent_inr,
      final_rent_confirmed:
        extracted.final_rent_confirmed,
      computed_budget_status:
        finalRent !== null &&
        maxRent !== null
          ? aboveCeiling
            ? "ABOVE_CEILING"
            : "WITHIN_CEILING"
          : "UNKNOWN",
      maintenance_inr:
        extracted.maintenance_inr,
      deposit_inr:
        extracted.deposit_inr,
      brokerage_inr:
        extracted.brokerage_inr,
      possession_date:
        normalizedPossessionDate ??
        extracted.possession_date_raw,
      occupancy_status:
        extracted.occupancy_status,
      visit_status:
        extracted.visit_status,
      owner_confirmation_required:
        extracted.owner_confirmation_required,
      callback_requested:
        extracted.callback_requested,
    };

    const noteParts = [
      `[${nowIso}] Gnani broker verification`,
      `tracking_id=${trackingId}`,
      `facts=${JSON.stringify(
        brokerFacts
      )}`,
    ];

    if (contradictions.length > 0) {
      noteParts.push(
        `contradictions=${JSON.stringify(
          contradictions
        )}`
      );
    }

    if (escalationRequired) {
      noteParts.push(
        `escalation=${escalationReasons.join(
          " "
        )}`
      );
    }

    const existingNotes =
      String(property.notes ?? "").trim();

    fields.notes = existingNotes
      ? `${existingNotes}\n${noteParts.join(
          " | "
        )}`
      : noteParts.join(" | ");

    const propertyUpdate =
      await stateWorker(origin, {
        operation: "upsert_state_record",
        tab: "properties",
        key_field: "property_id",
        key_value: propertyId,
        fields,
      });

    // =========================================================
    // APPEND IMMUTABLE DECISION EVENT
    // =========================================================

    const eventResult =
      await stateWorker(origin, {
        operation: "append_event",
        event_id: outcomeEventId,
        run_id: trackingId,
        timestamp: nowIso,
        actor: "Chaabi",
        connector:
          "gnani+composio",
        action:
          "process_broker_call_outcome",
        entity_type: "property",
        entity_id: propertyId,
        input_summary: JSON.stringify({
          conversation_id:
            callResult.conversation_id,
          extracted: brokerFacts,
          prior_status:
            property.status ?? null,
        }),
        output_summary: JSON.stringify({
          contradictions,
          blocking_contradictions:
            blockingContradictions,
          escalation_required:
            escalationRequired,
          escalation_reasons:
            escalationReasons,
          resulting_status:
            propertyUpdate?.record
              ?.status ?? null,
        }),
        status:
          escalationRequired
            ? "escalation_required"
            : "processed",
      });

    return NextResponse.json({
      success: true,
      processed: true,

      tracking_id: trackingId,
      conversation_id:
        callResult.conversation_id,
      property_id: propertyId,

      extracted: brokerFacts,

      policy: {
        policy_id:
          policyId ?? null,
        max_monthly_rent_inr:
          maxRent,
      },

      contradictions,
      blocking_contradictions:
        blockingContradictions,

      escalation: {
        required:
          escalationRequired,
        reasons:
          escalationReasons,
      },

      property_before:
        property,

      property_after:
        propertyUpdate.record,

      event:
        eventResult.event,

      safeguards: {
        canonical_conflicting_values_preserved:
          true,
        rent_overwritten:
          !hasContradiction("rent") &&
          isEmpty(property.rent) &&
          finalRent !== null,
        zero_money_values_treated_as_unknown:
          true,
        unconfirmed_asking_price_not_treated_as_final:
          true,
        within_ceiling_rent_variance_requires_approval:
          false,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unexpected process-call error",
      },
      { status: 500 }
    );
  }
}