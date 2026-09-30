import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    name: "Chaabi Rails Mock Server",
    version: "0.1.0",
    status: "running",
    rails: {
      delhivery: "coming_next",
      pine_labs: "coming_later",
      custom_capabilities: 3,
    },
  });
}