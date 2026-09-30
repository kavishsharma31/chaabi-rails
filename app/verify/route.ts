import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { address, months, req_id } = body;

    if (!address) {
      return NextResponse.json(
        {
          error: "No address provided",
          request_id: crypto.randomUUID(),
        },
        { status: 400 }
      );
    }

    if (months === undefined || months === null) {
      return NextResponse.json(
        {
          error: "'months' is a required field.",
          request_id: crypto.randomUUID(),
        },
        { status: 400 }
      );
    }

    if (!Number.isInteger(months) || months < 1 || months > 24) {
      return NextResponse.json(
        {
          error: "'months' must be an integer between 1 and 24.",
          request_id: crypto.randomUUID(),
        },
        { status: 400 }
      );
    }

    if (req_id === "VERIFY-TIMEOUT") {
      await new Promise((resolve) => setTimeout(resolve, 4000));

      return NextResponse.json(
        {
          error: "Request timed out",
          detail: "OpenSearch verification search timed out (10.0s budget)",
          request_id: crypto.randomUUID(),
        },
        { status: 504 }
      );
    }

    if (req_id === "VERIFY-NOT-FOUND") {
      return NextResponse.json({
        quality: "ok",
        granularity_level: "PREMISE",
        reason: "valid",
        formatted_address:
          "H-36, 1st Floor, Residency Greens, Sector 46, Gurugram, Haryana, 122003",
        corrections: "",
        is_verified: false,
        last_visited_date: null,
        verification_reasoning:
          "No confirmed delivery found within the requested time window.",
        request_id: crypto.randomUUID(),
        req_id,
      });
    }

    if (req_id === "VERIFY-INCOMPLETE") {
      return NextResponse.json({
        quality: "not_ok",
        granularity_level: "LOCALITY",
        reason: "incomplete",
        formatted_address: "Sector 46, Gurugram, Haryana",
        corrections: "Premise details missing",
        is_verified: false,
        last_visited_date: null,
        verification_reasoning:
          "Address is not specific enough for doorstep verification.",
        request_id: crypto.randomUUID(),
        req_id,
      });
    }

    return NextResponse.json({
      quality: "ok",
      granularity_level: "PREMISE",
      reason: "valid",
      formatted_address:
        "H-36, 1st Floor, Residency Greens, Sector 46, Gurugram, Haryana, 122003",
      corrections:
        "<h36|H-36>, <1st floor|1st Floor>, <residency greens|Residency Greens>, Sector 46, <gurgaon|Gurugram>, <|Haryana, 122003>",
      is_verified: true,
      last_visited_date: "2026-05-14",
      verification_reasoning:
        "Same premise, building, sector and pincode matched delivery history.",
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