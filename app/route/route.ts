import { NextResponse } from "next/server";

type Coordinate = [number, number];

function samePoint(a: Coordinate, b: Coordinate) {
  return a[0] === b[0] && a[1] === b[1];
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      geo_coords,
      travel_mode = "auto",
      alternate_routes = false,
      traffic_aware = false,
      departure_time = null,
      route_modifiers = null,
    } = body;

    if (!Array.isArray(geo_coords) || geo_coords.length < 2) {
      return NextResponse.json(
        {
          status: 400,
          code: "VALIDATION_ERROR",
          message: "At least 2 geo_coords are required",
        },
        { status: 400 }
      );
    }

    const allowedModes = ["auto", "motorcycle", "truck", "pedestrian"];

    if (!allowedModes.includes(travel_mode)) {
      return NextResponse.json(
        {
          status: 400,
          code: "INVALID_REQUEST",
          message: "Invalid travel_mode",
        },
        { status: 400 }
      );
    }

    const first = geo_coords[0] as Coordinate;
    const last = geo_coords[geo_coords.length - 1] as Coordinate;

    // Timeout fixture
    if (
      samePoint(first, [28.4595, 77.0266]) &&
      samePoint(last, [28.4596, 77.0267])
    ) {
      await new Promise((resolve) => setTimeout(resolve, 4000));

      return NextResponse.json(
        {
          status: 502,
          code: "ROUTING_API_ERROR",
          message: "Upstream Valhalla call failed",
          details: {
            upstream_status: 504,
            upstream_message: "Routing request timed out",
          },
        },
        { status: 502 }
      );
    }

    // Upstream failure fixture
    if (
      samePoint(first, [28.4501, 77.0201]) &&
      samePoint(last, [28.4502, 77.0202])
    ) {
      return NextResponse.json(
        {
          status: 502,
          code: "ROUTING_API_ERROR",
          message: "Upstream Valhalla call failed",
          details: {
            upstream_status: 500,
            upstream_message: "Routing service unavailable",
          },
        },
        { status: 502 }
      );
    }

    // Malformed-success fixture
    if (
      samePoint(first, [28.4401, 77.0101]) &&
      samePoint(last, [28.4402, 77.0102])
    ) {
      return NextResponse.json({
        status: true,
      });
    }

    const recommendedRoute = {
      distance: 12.45,
      duration: traffic_aware ? 1710.8 : 1523.4,
      geometry: geo_coords,
      waypoints: geo_coords.map(
        ([lat, lng]: Coordinate, index: number) => ({
          lat,
          lng,
          name: "",
          snap_distance_m: index === 0 ? 3.21 : 1.85,
        })
      ),
      legs: [
        {
          shape: "encoded_polyline_string",
          maneuvers: [
            {
              instruction: "Drive northeast on NH 48.",
              type: 2,
              length: 4.8,
              time: 540.2,
            },
            {
              instruction: "Continue straight toward the destination.",
              type: 1,
              length: 7.65,
              time: traffic_aware ? 1170.6 : 983.2,
            },
          ],
          summary: {
            length: 12.45,
            time: traffic_aware ? 1710.8 : 1523.4,
          },
        },
      ],
    };

    return NextResponse.json({
      status: true,
      recommended_route: recommendedRoute,
      alternates: alternate_routes
        ? [
            {
              distance: 14.1,
              duration: traffic_aware ? 1850.2 : 1690.6,
              geometry: geo_coords,
              waypoints: recommendedRoute.waypoints,
              legs: recommendedRoute.legs,
            },
          ]
        : [],
      debugging_result: null,
    });
  } catch {
    return NextResponse.json(
      {
        status: 500,
        code: "ROUTING_API_ERROR",
        message: "Unexpected internal error",
      },
      { status: 500 }
    );
  }
}