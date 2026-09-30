import { NextResponse } from "next/server";

type Coordinate = [number, number];

function samePoint(a: Coordinate, b: Coordinate) {
  return a[0] === b[0] && a[1] === b[1];
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      sources,
      targets,
      travel_mode = "auto",
      route_modifiers = null,
    } = body;

    if (!Array.isArray(sources) || sources.length === 0) {
      return NextResponse.json(
        { error: "Missing required field: sources" },
        { status: 400 }
      );
    }

    if (!Array.isArray(targets) || targets.length === 0) {
      return NextResponse.json(
        { error: "Missing required field: targets" },
        { status: 400 }
      );
    }

    const allowedModes = ["auto", "motorcycle", "truck", "pedestrian"];

    if (!allowedModes.includes(travel_mode)) {
      return NextResponse.json(
        {
          error: "Invalid travel_mode",
          error_code: 1002,
        },
        { status: 400 }
      );
    }

    const firstSource = sources[0] as Coordinate;
    const firstTarget = targets[0] as Coordinate;

    // Valid-coordinate fixture: mocked upstream timeout
    if (
      samePoint(firstSource, [28.4595, 77.0266]) &&
      samePoint(firstTarget, [28.4596, 77.0267])
    ) {
      await new Promise((resolve) => setTimeout(resolve, 4000));

      return NextResponse.json(
        { detail: "Upstream service 'matrix' timed out" },
        { status: 504 }
      );
    }

    // Valid-coordinate fixture: mocked upstream unavailable
    if (
      samePoint(firstSource, [28.4501, 77.0201]) &&
      samePoint(firstTarget, [28.4502, 77.0202])
    ) {
      return NextResponse.json(
        { detail: "Upstream service 'matrix' unavailable" },
        { status: 502 }
      );
    }

    // Valid request but deliberately malformed upstream response
    if (
      samePoint(firstSource, [28.4401, 77.0101]) &&
      samePoint(firstTarget, [28.4402, 77.0102])
    ) {
      return NextResponse.json({
        status: true
      });
    }

    const sourcesToTargets = sources.map(
      (_source: Coordinate, sourceIndex: number) =>
        targets.map((_target: Coordinate, targetIndex: number) => ({
          distance:
            8.345 +
            sourceIndex * 4.546 +
            targetIndex * 6.222,
          time:
            654.1 +
            sourceIndex * 333.1 +
            targetIndex * 448.7,
          from_index: sourceIndex,
          to_index: targetIndex,
        }))
    );

    return NextResponse.json({
      status: true,
      sources_to_targets: sourcesToTargets,
    });
  } catch {
    return NextResponse.json(
      { error: "Unexpected internal error" },
      { status: 500 }
    );
  }
}