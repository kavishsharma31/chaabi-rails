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

const ALLOWED_STATE_TABS = [
  "users",
  "permissions",
  "properties",
  "contacts",
  "tasks",
  "payments",
  "eval_runs",
] as const;

type StateTab = (typeof ALLOWED_STATE_TABS)[number];

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

type UpsertStateRecordTask = {
  operation: "upsert_state_record";
  tab: StateTab;
  key_field: string;
  key_value: string;
  fields: Record<string, string | number | boolean | null>;
};

type StateTask =
  | ReadEventTask
  | AppendEventTask
  | UpsertStateRecordTask;

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

async function readTab(client: Client, tab: string) {
  const data = await executeGoogleSheetTool(
    client,
    "GOOGLESHEETS_VALUES_GET",
    {
      spreadsheet_id: STATE_SHEET_ID,
      range: `${tab}!A1:Z1000`,
    }
  );

  const values = Array.isArray(data?.values)
    ? data.values
    : [];

  if (values.length === 0) {
    throw new Error(`${tab} tab is empty or has no headers`);
  }

  return {
    headers: values[0] as string[],
    rows: values.slice(1) as any[][],
  };
}

async function readEvent(client: Client, eventId: string) {
  const { headers, rows } = await readTab(client, "events");

  const eventIdIndex = headers.indexOf("event_id");

  if (eventIdIndex === -1) {
    throw new Error("events tab does not contain an event_id column");
  }

  const row = rows.find(
    (candidate) => candidate?.[eventIdIndex] === eventId
  );

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
      version: "2.2.0",
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
          "Event append succeeded but verification read failed"
        );
      }

      return NextResponse.json({
        success: true,
        written: true,
        verified: true,
        source: "google_sheets_via_composio",
        tab: "events",
        event: verifiedEvent,
      });
    }

    // =========================================================
    // UPSERT CURRENT STATE RECORD
    // =========================================================

    if (task.operation === "upsert_state_record") {
      if (
        !ALLOWED_STATE_TABS.includes(task.tab as StateTab)
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid state tab",
            allowed_tabs: ALLOWED_STATE_TABS,
          },
          { status: 400 }
        );
      }

      if (!task.key_field || !task.key_value) {
        return NextResponse.json(
          {
            success: false,
            error: "key_field and key_value are required",
          },
          { status: 400 }
        );
      }

      if (
        !task.fields ||
        typeof task.fields !== "object" ||
        Array.isArray(task.fields)
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "fields must be an object",
          },
          { status: 400 }
        );
      }

      const { headers, rows } = await readTab(
        client,
        task.tab
      );

      const keyIndex = headers.indexOf(task.key_field);

      if (keyIndex === -1) {
        return NextResponse.json(
          {
            success: false,
            error: `Key field '${task.key_field}' does not exist in ${task.tab}`,
            headers,
          },
          { status: 400 }
        );
      }

      const invalidFields = Object.keys(task.fields).filter(
        (field) => !headers.includes(field)
      );

      if (invalidFields.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: "One or more fields do not exist in the target tab",
            invalid_fields: invalidFields,
            headers,
          },
          { status: 400 }
        );
      }

      const existingRow = rows.find(
        (row) =>
          String(row?.[keyIndex] ?? "") ===
          String(task.key_value)
      );

      const mergedRecord: Record<string, any> = {};

      headers.forEach((header, index) => {
        mergedRecord[header] =
          existingRow?.[index] ?? "";
      });

      mergedRecord[task.key_field] = task.key_value;

      for (const [key, value] of Object.entries(
        task.fields
      )) {
        mergedRecord[key] = value ?? "";
      }

      const row = headers.map(
        (header) => mergedRecord[header] ?? ""
      );

      await executeGoogleSheetTool(
        client,
        "GOOGLESHEETS_UPSERT_ROWS",
        {
          spreadsheetId: STATE_SHEET_ID,
          sheetName: task.tab,
          keyColumn: task.key_field,
          headers,
          rows: [row],
          strictMode: true,
        }
      );

      const verification = await readTab(
        client,
        task.tab
      );

      const verifiedRow = verification.rows.find(
        (candidate) =>
          String(candidate?.[keyIndex] ?? "") ===
          String(task.key_value)
      );

      if (!verifiedRow) {
        throw new Error(
          "State upsert succeeded but verification read failed"
        );
      }

      const verifiedRecord = Object.fromEntries(
        headers.map((header, index) => [
          header,
          verifiedRow[index] ?? null,
        ])
      );

      return NextResponse.json({
        success: true,
        upserted: true,
        verified: true,
        mode: existingRow ? "updated" : "inserted",
        source: "google_sheets_via_composio",
        tab: task.tab,
        key_field: task.key_field,
        key_value: task.key_value,
        record: verifiedRecord,
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