import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { address, req_id } = body;

    if (!address) {
      return NextResponse.json(
        { error: "address field is required" },
        { status: 400 }
      );
    }

    if (req_id === "GEOCODE-TIMEOUT") {
      await new Promise((resolve) => setTimeout(resolve, 4000));

      return NextResponse.json(
        { detail: "Upstream service 'geocode' timed out" },
        { status: 504 }
      );
    }

    if (req_id === "GEOCODE-UPSTREAM-DOWN") {
      return NextResponse.json(
        { detail: "Upstream service 'geocode' unavailable" },
        { status: 502 }
      );
    }

    if (req_id === "GEOCODE-FAIL") {
      return NextResponse.json(
        {
          error: "internal server error",
          req_id,
        },
        { status: 500 }
      );
    }

    if (req_id === "GEOCODE-LOW-CONFIDENCE") {
      return NextResponse.json({
        req_id,
        lat: 28.4595,
        lng: 77.0266,
        error_radius: 650,
      });
    }

    return NextResponse.json({
      req_id: req_id ?? null,
      lat: 28.422437,
      lng: 77.053849,
      error_radius: 45,
    });
  } catch {
    return NextResponse.json(
      { error: "internal server error", req_id: null },
      { status: 500 }
    );
  }
}