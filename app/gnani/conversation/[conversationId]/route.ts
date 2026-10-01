import { NextResponse } from "next/server";
import { logConnectorCall } from "@/lib/logger";

export async function GET(request: Request) {
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

    const url = new URL(request.url);
    const conversationId = url.pathname.split("/").pop();

    if (!conversationId) {
      return NextResponse.json(
        {
          success: false,
          error: "conversationId is required",
        },
        { status: 400 }
      );
    }

    const authorization = bearer.startsWith("Bearer ")
      ? bearer
      : `Bearer ${bearer}`;

    const gnaniResponse = await fetch(
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
      endpoint: `/conversation_stats_v2/${conversationId}`,
      method: "GET",
      request: {
        conversation_id: conversationId,
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

    const conversation = responseData?.response?.data?.[0];

    if (!conversation) {
      return NextResponse.json(
        {
          success: false,
          error: "Conversation data not found",
          conversation_id: conversationId,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      conversation_id: conversation.conversationId ?? conversationId,
      bot_name: conversation.botName ?? null,
      type: conversation.type ?? null,
      call_status: conversation.callStatus ?? null,
      start_time: conversation.startTime ?? null,
      end_time: conversation.endTime ?? null,
      call_duration: conversation.callDuration ?? null,
      overall_call_disposition:
        conversation.overallCallDisposition ?? null,
      post_call_extraction:
        conversation.postCallExtraction ?? null,
      audio_url: conversation.audioUrl ?? null,
      transcript: conversation.utteranceAnalytics ?? [],
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