import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    name: "Chaabi Rails Mock Server",
    version: "0.2.0",
    status: "running",
    rails: {
      delhivery: {
        status: "ready",
        endpoints: [
          "/validate",
          "/geocode",
          "/verify",
          "/matrix",
          "/route",
        ],
      },
      pine_labs: "coming_next",
      custom_capabilities: {
        available_slots: 3,
        used_slots: 0,
      },
    },
  });
}