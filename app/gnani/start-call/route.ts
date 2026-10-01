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

    const { phone, name, countryCode = "+91" } = body;

    if (!phone) {
      return NextResponse.json(
        {
          success: false,
          error: "phone is required",
        },
        { status: 400 }
      );
    }

    const authorization = bearer.startsWith("Bearer ")
      ? bearer
      : `Bearer ${bearer}`;

    const trackingId = `chaabi-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    const gnaniName = `${name ?? "Broker"} | ${trackingId}`;

    const gnaniBody = {
      phone,
      name: gnaniName,
      countryCode,
    };

    const gnaniResponse = await fetch(
      `https://api.inya.ai/genbots/trigger_call/v3/${BOT_ID}?environment=production`,
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
      endpoint: "/trigger_call/v3",
      method: "POST",
      request: {
        ...gnaniBody,
        phone: "[redacted]",
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

    return NextResponse.json({
      success: true,
      tracking_id: trackingId,
      gnani_name: gnaniName,
      message: responseData?.message ?? "Call triggered",
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