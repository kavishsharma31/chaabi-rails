import { NextResponse } from "next/server";
import { logConnectorCall } from "@/lib/logger";

const BOT_ID = "8721446034a74eb89dc8caef3e5fe454";

function authHeader(bearer: string) {
  return bearer.startsWith("Bearer ")
    ? bearer
    : `Bearer ${bearer}`;
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

    // Step 1: Find the matching conversation
    const now = new Date();
    const sixHoursAgo = new Date(
      now.getTime() - 6 * 60 * 60 * 1000
    );

    const listBody = {
      page_no: 1,
      page_size: 50,
      filter: {
        start_date: sixHoursAgo.toISOString(),
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
      listData = { raw_response: listText };
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

    // Step 2: Get full conversation details
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
      statsData = { raw_response: statsText };
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

    const conversation = statsData?.response?.data?.[0];

    if (!conversation) {
      return NextResponse.json({
        success: true,
        found: true,
        complete: false,
        tracking_id: trackingId,
        conversation_id: conversationId,
        message: "Conversation exists but details are not available yet",
      });
    }

    return NextResponse.json({
      success: true,
      found: true,
      complete: Boolean(conversation.endTime),
      tracking_id: trackingId,
      conversation_id: conversationId,
      name: matchingCall.name,
      call_status: conversation.callStatus ?? null,
      start_time: conversation.startTime ?? null,
      end_time: conversation.endTime ?? null,
      call_duration: conversation.callDuration ?? null,
      overall_call_disposition:
        conversation.overallCallDisposition ?? null,
      post_call_extraction:
        conversation.postCallExtraction ?? null,
      transcript: conversation.utteranceAnalytics ?? [],
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