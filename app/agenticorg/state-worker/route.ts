import { NextResponse } from "next/server";

const AGENTICORG_BASE_URL =
  "https://agenticorg.hackathon.pinelabs.com";

const STATE_WORKER_AGENT_ID =
  "b03ed0dd-4f3b-40e2-928d-3f06e927697f";

export async function POST(request: Request) {
  try {
    const session = process.env.AGENTICORG_SESSION;
    const csrf = process.env.AGENTICORG_CSRF;

    if (!session || !csrf) {
      return NextResponse.json(
        {
          success: false,
          error: "AgenticOrg credentials are not configured",
        },
        { status: 500 }
      );
    }

    const body = await request.json();
    const task = body?.task;

    if (!task || typeof task !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: "task is required",
        },
        { status: 400 }
      );
    }

    const response = await fetch(
      `${AGENTICORG_BASE_URL}/api/v1/agents/${STATE_WORKER_AGENT_ID}/run`,
      {
        method: "POST",
        headers: {
          Accept: "application/json, text/plain, */*",
          "Content-Type": "application/json",
          Cookie: `agenticorg_session=${session}; agenticorg_csrf=${csrf}`,
          "X-CSRF-Token": csrf,
          Origin: AGENTICORG_BASE_URL,
          Referer: `${AGENTICORG_BASE_URL}/dashboard/agents/${STATE_WORKER_AGENT_ID}`,
        },
        body: JSON.stringify({
          action: "run",
          inputs: {
            task,
          },
          csrf_token: csrf,
        }),
        cache: "no-store",
      }
    );

    const text = await response.text();

    let data: unknown;

    try {
      data = JSON.parse(text);
    } catch {
      data = {
        raw_response: text,
      };
    }

    return NextResponse.json(
      {
        success: response.ok,
        agenticorg_status: response.status,
        response: data,
      },
      {
        status: response.ok ? 200 : response.status,
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unexpected state worker bridge error",
      },
      { status: 500 }
    );
  }
}