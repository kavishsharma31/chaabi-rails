import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    success: true,
    service: "chaabi-rails",
    status: "ok",
    timestamp: new Date().toISOString(),
  });
}