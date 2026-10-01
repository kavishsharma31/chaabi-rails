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

    let body: {
      page_no?: number;
      page_size?: number;
      start_date?: string;
      end_date?: string;
    } = {};

    try {
      body = await request.json();
    } catch {
      // Empty request body is allowed
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(
      now.getTime() - 30 * 24 * 60 * 60 * 1000
    );

    const gnaniBody = {
      page_no: body.page_no ?? 1,
      page_size: body.page_size ?? 10,
      filter: {
        start_date: body.start_date ?? thirtyDaysAgo.toISOString(),
        end_date: body.end_date ?? now.toISOString(),
      },
    };

    const authorization = bearer.startsWith("Bearer ")
      ? bearer
      : `Bearer ${bearer}`;

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
      request: gnaniBody,
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

    const conversations = responseData?.response?.data ?? [];

    return NextResponse.json({
      success: true,
      total_count: responseData?.response?.totalCount ?? conversations.length,
      calls: conversations.map((call: any) => ({
        conversation_id: call.conversationId,
        bot_id: call.botId,
        bot_name: call.botName,
        type: call.type,
        start_time: call.startTime,
        end_time: call.endTime,
        call_status: call.callStatus ?? null,
        audio_url: call.audioUrl ?? null,
      })),
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