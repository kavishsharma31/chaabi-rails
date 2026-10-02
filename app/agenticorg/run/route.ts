import { NextResponse } from "next/server";

const AGENTICORG_BASE_URL =
  "https://agenticorg.hackathon.pinelabs.com";

export async function POST(request: Request) {
  try {
    const session = process.env.AGENTICORG_SESSION;
    const csrf = process.env.AGENTICORG_CSRF;
    const agentId = process.env.AGENTICORG_AGENT_ID;

    if (!session || !csrf || !agentId) {
      return NextResponse.json(
        {
          success: false,
          error: "AgenticOrg environment variables are not configured",
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

    const agenticOrgResponse = await fetch(
      `${AGENTICORG_BASE_URL}/api/v1/agents/${agentId}/run`,
      {
        method: "POST",
        headers: {
          Accept: "application/json, text/plain, */*",
          "Content-Type": "application/json",
          Cookie: `agenticorg_session=${session}; agenticorg_csrf=${csrf}`,
          "X-CSRF-Token": csrf,
          Origin: AGENTICORG_BASE_URL,
          Referer: `${AGENTICORG_BASE_URL}/dashboard/agents/${agentId}`,
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

    const responseText = await agenticOrgResponse.text();

    let responseData: unknown;

    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = {
        raw_response: responseText,
      };
    }

    return NextResponse.json(
      {
        success: agenticOrgResponse.ok,
        agenticorg_status: agenticOrgResponse.status,
        response: responseData,
      },
      {
        status: agenticOrgResponse.ok
          ? 200
          : agenticOrgResponse.status,
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unexpected AgenticOrg bridge error",
      },
      { status: 500 }
    );
  }
}