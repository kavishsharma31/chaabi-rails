import { NextResponse } from "next/server";
import { logConnectorCall } from "@/lib/logger";

export async function POST(request: Request) {
  const startedAt = Date.now();
  let body: any = null;

  function respond(responseBody: unknown, statusCode = 200) {
    logConnectorCall({
      timestamp: new Date().toISOString(),
      connector: "delhivery",
      endpoint: "/validate",
      method: "POST",
      request: body,
      response: responseBody,
      status_code: statusCode,
      latency_ms: Date.now() - startedAt,
    });

    return NextResponse.json(responseBody, {
      status: statusCode,
    });
  }

  try {
    body = await request.json();

    const { address, req_id } = body;

    // Missing address
    if (!address) {
      return respond(
        {
          error: "No address provided",
          request_id: crypto.randomUUID(),
        },
        400
      );
    }

    // Simulated timeout
    if (req_id === "VALIDATE-TIMEOUT") {
      await new Promise((resolve) => setTimeout(resolve, 4000));

      return respond(
        {
          error: "Request timed out",
          detail: "OpenSearch search timed out (10.0s budget)",
          request_id: crypto.randomUUID(),
        },
        504
      );
    }

    // Invalid / junk address
    if (req_id === "VALIDATE-BAD") {
      return respond({
        quality: "not_ok",
        granularity_level: "NONE",
        reason: "invalid_or_junk",
        formatted_address: null,
        corrections: null,
        request_id: crypto.randomUUID(),
        req_id,
      });
    }

    // Incomplete address
    if (req_id === "VALIDATE-INCOMPLETE") {
      return respond({
        quality: "not_ok",
        granularity_level: "LOCALITY",
        reason: "incomplete",
        formatted_address: "Sector 45, Gurugram, Haryana",
        corrections: "Premise/building details missing",
        request_id: crypto.randomUUID(),
        req_id,
      });
    }

    // Normal successful response
    return respond({
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
    return respond(
      {
        error: "Internal Server Error",
        request_id: crypto.randomUUID(),
      },
      500
    );
  }
}