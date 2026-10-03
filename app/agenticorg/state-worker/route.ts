import { NextResponse } from "next/server";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const COMPOSIO_MCP_URL = "https://connect.composio.dev/mcp";

const STATE_SHEET_ID =
  "1acMC3cwIXVql_N7p9YJZjnrx9JDkZxR6eVzPReNkabc";

const GOOGLE_SHEETS_ACCOUNT = "googlesheets_gecko-baluba";

type StateTask = {
  operation: "read_event";
  event_id: string;
};

function parseToolText(result: any) {
  const textPart = result?.content?.find(
    (part: any) => part?.type === "text"
  );

  if (!textPart?.text) {
    throw new Error("Composio returned no text response");
  }

  return JSON.parse(textPart.text);
}

export async function POST(request: Request) {
  let client: Client | null = null;

  try {
    const consumerKey = process.env.COMPOSIO_CONSUMER_KEY;

    if (!consumerKey) {
      return NextResponse.json(
        {
          success: false,
          error: "COMPOSIO_CONSUMER_KEY is not configured",
        },
        { status: 500 }
      );
    }

    const body = await request.json();

    if (!body?.task || typeof body.task !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: "task must be supplied as a JSON string",
        },
        { status: 400 }
      );
    }

    let task: StateTask;

    try {
      task = JSON.parse(body.task);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error:
            'task must be valid JSON, for example {"operation":"read_event","event_id":"STATE-WORKER-TEST-001"}',
        },
        { status: 400 }
      );
    }

    if (task.operation !== "read_event") {
      return NextResponse.json(
        {
          success: false,
          error: `Unsupported state operation: ${task.operation}`,
        },
        { status: 400 }
      );
    }

    if (!task.event_id) {
      return NextResponse.json(
        {
          success: false,
          error: "event_id is required",
        },
        { status: 400 }
      );
    }

    client = new Client({
      name: "chaabi-state-worker",
      version: "2.0.0",
    });

    const transport = new StreamableHTTPClientTransport(
      new URL(COMPOSIO_MCP_URL),
      {
        requestInit: {
          headers: {
            "x-consumer-api-key": consumerKey,
          },
        },
      }
    );

    await client.connect(transport);

    const result = await client.callTool({
      name: "COMPOSIO_MULTI_EXECUTE_TOOL",
      arguments: {
        tools: [
          {
            account: GOOGLE_SHEETS_ACCOUNT,
            tool_slug: "GOOGLESHEETS_VALUES_GET",
            arguments: {
              spreadsheet_id: STATE_SHEET_ID,
              range: "events!A1:K1000",
            },
          },
        ],
        sync_response_to_workbench: false,
      },
    });

    const parsed = parseToolText(result);

    const executionResult = parsed?.data?.results?.[0];

    if (!executionResult?.response?.successful) {
      return NextResponse.json(
        {
          success: false,
          error:
            executionResult?.response?.error ??
            executionResult?.response?.data?.message ??
            "Google Sheets read failed",
          composio_result: parsed,
        },
        { status: 502 }
      );
    }

    const values = executionResult?.response?.data?.values;

    if (!Array.isArray(values) || values.length === 0) {
      return NextResponse.json({
        success: true,
        found: false,
        event_id: task.event_id,
      });
    }

    const headers = values[0] as string[];
    const eventIdIndex = headers.indexOf("event_id");

    if (eventIdIndex === -1) {
      return NextResponse.json(
        {
          success: false,
          error: "events tab does not contain an event_id column",
          headers,
        },
        { status: 500 }
      );
    }

    const row = values
      .slice(1)
      .find((candidate: any[]) => candidate?.[eventIdIndex] === task.event_id);

    if (!row) {
      return NextResponse.json({
        success: true,
        found: false,
        event_id: task.event_id,
      });
    }

    const event = Object.fromEntries(
      headers.map((header, index) => [
        header,
        row[index] ?? null,
      ])
    );

    return NextResponse.json({
      success: true,
      found: true,
      source: "google_sheets_via_composio",
      spreadsheet_id: STATE_SHEET_ID,
      tab: "events",
      event,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unexpected direct Composio state-worker error",
      },
      { status: 500 }
    );
  } finally {
    if (client) {
      try {
        await client.close();
      } catch {}
    }
  }
}