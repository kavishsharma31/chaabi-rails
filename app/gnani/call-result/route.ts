import { NextResponse } from "next/server";
import { logConnectorCall } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BOT_ID = "8721446034a74eb89dc8caef3e5fe454";

function authHeader(bearer: string) {
  return bearer.startsWith("Bearer ")
    ? bearer
    : `Bearer ${bearer}`;
}

function isUsefulValue(value: any) {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === "string") {
    const cleaned = value.trim();

    if (
      cleaned === "" ||
      cleaned.toUpperCase() === "NA" ||
      cleaned.toUpperCase() === "N/A" ||
      cleaned.toLowerCase() === "null"
    ) {
      return false;
    }
  }

  return true;
}

function parseMaybeJson(value: any) {
  if (!isUsefulValue(value)) {
    return null;
  }

  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function firstUseful(...values: any[]) {
  for (const value of values) {
    if (isUsefulValue(value)) {
      return parseMaybeJson(value);
    }
  }

  return null;
}

function findInterestingFields(
  value: any,
  path = "",
  depth = 0
): Record<string, any> {
  if (
    value === null ||
    value === undefined ||
    depth > 6
  ) {
    return {};
  }

  if (Array.isArray(value)) {
    const output: Record<string, any> = {};

    value.forEach((item, index) => {
      Object.assign(
        output,
        findInterestingFields(
          item,
          `${path}[${index}]`,
          depth + 1
        )
      );
    });

    return output;
  }

  if (typeof value !== "object") {
    return {};
  }

  const output: Record<string, any> = {};

  for (const [key, child] of Object.entries(value)) {
    const childPath = path
      ? `${path}.${key}`
      : key;

    const normalizedKey = key
      .replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase();

    const interesting =
      normalizedKey.includes("extraction") ||
      normalizedKey.includes("disposition") ||
      normalizedKey.includes("stagecode") ||
      normalizedKey.includes("datafield") ||
      normalizedKey.includes("postcall");

    if (interesting) {
      output[childPath] = child;
    }

    if (
      child &&
      typeof child === "object"
    ) {
      Object.assign(
        output,
        findInterestingFields(
          child,
          childPath,
          depth + 1
        )
      );
    }
  }

  return output;
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
    const trackingId = body.tracking_id;

    if (!trackingId) {
      return NextResponse.json(
        {
          success: false,
          error: "tracking_id is required",
        },
        { status: 400 }
      );
    }

    const authorization = authHeader(bearer);

    // =========================================================
    // STEP 1: FIND MATCHING CONVERSATION
    // =========================================================

    const now = new Date();
    const sevenDaysAgo = new Date(
      now.getTime() - 7 * 24 * 60 * 60 * 1000
    );

    const listBody = {
      page_no: 1,
      page_size: 50,
      filter: {
        start_date: sevenDaysAgo.toISOString(),
        end_date: now.toISOString(),
      },
    };

    const listResponse = await fetch(
      `https://api.inya.ai/genbots/dashboard/write/conversation_logs/v3?bot_id=${BOT_ID}&bot_type=SINGLE&environment=development`,
      {
        method: "POST",
        headers: {
          Authorization: authorization,
          "X-Organization-Id": "common",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(listBody),
        cache: "no-store",
      }
    );

    const listText = await listResponse.text();

    let listData: any;

    try {
      listData = JSON.parse(listText);
    } catch {
      listData = {
        raw_response: listText,
      };
    }

    if (!listResponse.ok) {
      return NextResponse.json(
        {
          success: false,
          stage: "find_call",
          gnani_status: listResponse.status,
          error: listData,
        },
        { status: listResponse.status }
      );
    }

    const calls = listData?.response?.data ?? [];

    const matchingCall = calls.find(
      (call: any) =>
        typeof call.name === "string" &&
        call.name.includes(trackingId)
    );

    if (!matchingCall) {
      return NextResponse.json({
        success: true,
        found: false,
        complete: false,
        tracking_id: trackingId,
        message: "Call conversation not available yet",
      });
    }

    const conversationId = matchingCall.conversationId;

    // =========================================================
    // STEP 2: GET FULL CONVERSATION DETAILS
    // =========================================================

    const statsResponse = await fetch(
      `https://api.inya.ai/analytics/conversation_stats_v2/${conversationId}`,
      {
        method: "GET",
        headers: {
          Authorization: authorization,
          "X-Organization-Id": "common",
        },
        cache: "no-store",
      }
    );

    const statsText = await statsResponse.text();

    let statsData: any;

    try {
      statsData = JSON.parse(statsText);
    } catch {
      statsData = {
        raw_response: statsText,
      };
    }

    logConnectorCall({
      timestamp: new Date().toISOString(),
      connector: "gnani",
      endpoint: "/call-result",
      method: "POST",
      request: {
        tracking_id: trackingId,
        conversation_id: conversationId,
      },
      response: statsData,
      status_code: statsResponse.status,
      latency_ms: Date.now() - startedAt,
    });

    if (!statsResponse.ok) {
      return NextResponse.json(
        {
          success: false,
          stage: "conversation_details",
          conversation_id: conversationId,
          gnani_status: statsResponse.status,
          error: statsData,
        },
        { status: statsResponse.status }
      );
    }

    const conversation =
      statsData?.response?.data?.[0];

    if (!conversation) {
      return NextResponse.json({
        success: true,
        found: true,
        complete: false,
        tracking_id: trackingId,
        conversation_id: conversationId,
        message:
          "Conversation exists but details are not available yet",
      });
    }

    // =========================================================
    // EXTRACTION / DISPOSITION DISCOVERY
    // =========================================================

    const postCallExtraction = firstUseful(
      conversation.postCallExtraction,
      conversation.post_call_extraction,
      conversation.postCallExtractionV2,
      conversation.post_call_extraction_v2,
      conversation.postCallDataExtraction,
      conversation.post_call_data_extraction,
      conversation.extraction,
      conversation.extractionResult,
      conversation.extraction_result,
      conversation.dataFields,
      conversation.data_fields,
      conversation.dispositionResult?.postCallExtraction,
      conversation.dispositionResult?.post_call_extraction,
      conversation.dispositionResult?.postCallExtractionV2,
      conversation.dispositionResult?.post_call_extraction_v2,
      conversation.disposition_result?.postCallExtraction,
      conversation.disposition_result?.post_call_extraction,
      conversation.disposition_result?.postCallExtractionV2,
      conversation.disposition_result?.post_call_extraction_v2
    );

    const dispositionResult = firstUseful(
      conversation.dispositionResult,
      conversation.disposition_result
    );

    const stageCode = firstUseful(
      conversation.STAGE_CODE,
      conversation.stageCode,
      conversation.stage_code
    );

    const extractionDebug =
      findInterestingFields(conversation);

    return NextResponse.json({
      success: true,
      found: true,
      complete: Boolean(conversation.endTime),

      tracking_id: trackingId,
      conversation_id: conversationId,
      name: matchingCall.name,

      call_status:
        conversation.callStatus ?? null,

      start_time:
        conversation.startTime ?? null,

      end_time:
        conversation.endTime ?? null,

      call_duration:
        conversation.callDuration ?? null,

      overall_call_disposition:
        firstUseful(
          conversation.overallCallDisposition,
          conversation.overall_call_disposition
        ),

      disposition_result: dispositionResult,

      stage_code: stageCode,

      post_call_extraction: postCallExtraction,

      transcript:
        conversation.utteranceAnalytics ?? [],

      debug: {
        conversation_keys: Object.keys(conversation),
        extraction_related_fields:
          extractionDebug,
      },
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