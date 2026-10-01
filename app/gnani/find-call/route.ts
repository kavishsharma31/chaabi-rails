import { NextResponse } from "next/server";
import { logConnectorCall } from "@/lib/logger";

const BOT_ID = "8721446034a74eb89dc8caef3e5fe454";

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

    const authorization = bearer.startsWith("Bearer ")
      ? bearer
      : `Bearer ${bearer}`;

    // Search recent calls only.
    const now = new Date();
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);

    const gnaniBody = {
      page_no: 1,
      page_size: 50,
      filter: {
        start_date: sixHoursAgo.toISOString(),
        end_date: now.toISOString(),
      },
    };

    const gnaniResponse = await fetch(
      `https://api.inya.ai/genbots/dashboard/write/conversation_logs/v3?bot_id=${BOT_ID}&bot_type=SINGLE&environment=development`,
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
      endpoint: "/conversation_logs/v3",
      method: "POST",
      request: {
        tracking_id: trackingId,
        ...gnaniBody,
      },
      response: responseData,
      status_code: gnaniResponse.status,
      latency_ms: Date.now() - startedAt,
    });

    if (!gnaniResponse.ok) {
      return NextResponse.json(
        {
          success: false,
          gnani_status: gnaniResponse.status,
          error: responseData,
        },
        { status: gnaniResponse.status }
      );
    }

    const calls = responseData?.response?.data ?? [];

    const matchingCall = calls.find(
      (call: any) =>
        typeof call.name === "string" &&
        call.name.includes(trackingId)
    );

    // Not finding it yet is normal while the call is still being created.
    if (!matchingCall) {
      return NextResponse.json({
        success: true,
        found: false,
        tracking_id: trackingId,
        message: "Matching Gnani conversation not found yet",
      });
    }

    return NextResponse.json({
      success: true,
      found: true,
      tracking_id: trackingId,
      conversation_id: matchingCall.conversationId,
      name: matchingCall.name,
      call_status: matchingCall.callStatus ?? null,
      start_time: matchingCall.startTime ?? null,
      end_time: matchingCall.endTime ?? null,
      type: matchingCall.type ?? null,
      bot_name: matchingCall.botName ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Unexpected server error",
      },
      { status: 500 }
    );
  }
}