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

type ReadEventTask = {
  operation: "read_event";
  event_id: string;
};

type AppendEventTask = {
  operation: "append_event";
  event_id: string;
  run_id?: string;
  timestamp?: string;
  actor?: string;
  connector?: string;
  action?: string;
  entity_type?: string;
  entity_id?: string;
  input_summary?: string;
  output_summary?: string;
  status?: string;
};

type StateTask = ReadEventTask | AppendEventTask;

function parseToolText(result: any) {
  const textPart = result?.content?.find(
    (part: any) => part?.type === "text"
  );

  if (!textPart?.text) {
    throw new Error("Composio returned no text response");
  }

  return JSON.parse(textPart.text);
}

async function executeGoogleSheetTool(
  client: Client,
  toolSlug: string,
  args: Record<string, unknown>
) {
  const result = await client.callTool({
    name: "COMPOSIO_MULTI_EXECUTE_TOOL",
    arguments: {
      tools: [
        {
          account: GOOGLE_SHEETS_ACCOUNT,
          tool_slug: toolSlug,
          arguments: args,
        },
      ],
      sync_response_to_workbench: false,
    },
  });

  const parsed = parseToolText(result);
  const executionResult = parsed?.data?.results?.[0];

  if (!executionResult?.response?.successful) {
    throw new Error(
      executionResult?.response?.error ??
        executionResult?.response?.data?.message ??
        `${toolSlug} failed`
    );
  }

  return executionResult.response.data;
}

async function readEvent(client: Client, eventId: string) {
  const data = await executeGoogleSheetTool(
    client,
    "GOOGLESHEETS_VALUES_GET",
    {
      spreadsheet_id: STATE_SHEET_ID,
      range: "events!A1:K1000",
    }
  );

  const values = data?.values;

  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }

  const headers = values[0] as string[];
  const eventIdIndex = headers.indexOf("event_id");

  if (eventIdIndex === -1) {
    throw new Error("events tab does not contain an event_id column");
  }

  const row = values
    .slice(1)
    .find((candidate: any[]) => candidate?.[eventIdIndex] === eventId);

  if (!row) {
    return null;
  }

  return Object.fromEntries(
    headers.map((header, index) => [
      header,
      row[index] ?? null,
    ])
  );
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
          error: "task must be valid JSON",
        },
        { status: 400 }
      );
    }

    client = new Client({
      name: "chaabi-state-worker",
      version: "2.1.0",
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

    // =========================================================
    // READ EVENT
    // =========================================================

    if (task.operation === "read_event") {
      if (!task.event_id) {
        return NextResponse.json(
          {
            success: false,
            error: "event_id is required",
          },
          { status: 400 }
        );
      }

      const event = await readEvent(client, task.event_id);

      if (!event) {
        return NextResponse.json({
          success: true,
          found: false,
          event_id: task.event_id,
        });
      }

      return NextResponse.json({
        success: true,
        found: true,
        source: "google_sheets_via_composio",
        spreadsheet_id: STATE_SHEET_ID,
        tab: "events",
        event,
      });
    }

    // =========================================================
    // APPEND EVENT
    // =========================================================

    if (task.operation === "append_event") {
      if (!task.event_id) {
        return NextResponse.json(
          {
            success: false,
            error: "event_id is required",
          },
          { status: 400 }
        );
      }

      const existing = await readEvent(client, task.event_id);

      if (existing) {
        return NextResponse.json(
          {
            success: false,
            error: "An event with this event_id already exists",
            event: existing,
          },
          { status: 409 }
        );
      }

      const row = [
        task.event_id,
        task.run_id ?? "",
        task.timestamp ?? new Date().toISOString(),
        task.actor ?? "Chaabi",
        task.connector ?? "run_state_worker",
        task.action ?? "",
        task.entity_type ?? "",
        task.entity_id ?? "",
        task.input_summary ?? "",
        task.output_summary ?? "",
        task.status ?? "completed",
      ];

      await executeGoogleSheetTool(
        client,
        "GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND",
        {
          spreadsheetId: STATE_SHEET_ID,
          range: "events!A:K",
          valueInputOption: "USER_ENTERED",
          insertDataOption: "INSERT_ROWS",
          majorDimension: "ROWS",
          includeValuesInResponse: true,
          values: [row],
        }
      );

      const verifiedEvent = await readEvent(
        client,
        task.event_id
      );

      if (!verifiedEvent) {
        throw new Error(
          "Event append returned successfully but verification read failed"
        );
      }

      return NextResponse.json({
        success: true,
        written: true,
        verified: true,
        source: "google_sheets_via_composio",
        spreadsheet_id: STATE_SHEET_ID,
        tab: "events",
        event: verifiedEvent,
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: "Unsupported state operation",
      },
      { status: 400 }
    );
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