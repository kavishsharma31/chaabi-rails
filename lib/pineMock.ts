export type PineHoldState = {
  hold_id: string;
  property_id: string;
  property_name: string;
  tenant_name: string;
  amount_inr: number;
  currency: "INR";
  status: "HELD" | "RELEASED" | "CANCELLED";
  created_at: string;
  updated_at: string;
  approval_text: string;
  signing_reference?: string;
  cancellation_reason?: string;
};

export function encodeHoldState(state: PineHoldState) {
  return Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
}

export function decodeHoldState(token: string): PineHoldState {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const state = JSON.parse(decoded);

    if (
      !state ||
      typeof state.hold_id !== "string" ||
      typeof state.amount_inr !== "number" ||
      !["HELD", "RELEASED", "CANCELLED"].includes(state.status)
    ) {
      throw new Error("Invalid hold state");
    }

    return state as PineHoldState;
  } catch {
    throw new Error("INVALID_HOLD_STATE");
  }
}