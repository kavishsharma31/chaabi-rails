import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const { address, req_id } = body;

    if (!address) {
      return NextResponse.json(
        {
          error: "No address provided",
          request_id: crypto.randomUUID(),
        },
        { status: 400 }
      );
    }

    // Deterministic mock cases for testing
    if (req_id === "VALIDATE-TIMEOUT") {
      return NextResponse.json(
        {
          error: "Request timed out",
          detail: "OpenSearch search timed out (10.0s budget)",
          request_id: crypto.randomUUID(),
        },
        { status: 504 }
      );
    }

    if (req_id === "VALIDATE-BAD") {
      return NextResponse.json({
        quality: "not_ok",
        granularity_level: "NONE",
        reason: "invalid_or_junk",
        formatted_address: null,
        corrections: null,
        request_id: crypto.randomUUID(),
        req_id,
      });
    }

    if (req_id === "VALIDATE-INCOMPLETE") {
      return NextResponse.json({
        quality: "not_ok",
        granularity_level: "LOCALITY",
        reason: "incomplete",
        formatted_address: "Sector 45, Gurugram, Haryana",
        corrections: "Premise/building details missing",
        request_id: crypto.randomUUID(),
        req_id,
      });
    }

    // Default successful mock
    return NextResponse.json({
      quality: "ok",
      granularity_level: "PREMISE",
      reason: "valid",
      formatted_address:
        "H-36, 1st Floor, Residency Greens, Sector 46, Gurugram, Haryana",
      corrections: "",
      request_id: crypto.randomUUID(),
      req_id: req_id ?? null,
    });
  } catch {
    return NextResponse.json(
      {
        error: "Internal Server Error",
        request_id: crypto.randomUUID(),
      },
      { status: 500 }
    );
  }
}