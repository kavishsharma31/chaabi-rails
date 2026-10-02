export type PineHoldStatus = "HELD" | "RELEASED" | "CANCELLED";

export type PineHoldState = {
  hold_id: string;
  status: PineHoldStatus;
  signing_reference?: string;
  cancellation_reason?: string;
};

function statusCode(status: PineHoldStatus) {
  if (status === "HELD") return "H";
  if (status === "RELEASED") return "R";
  return "C";
}

function decodeStatus(code: string): PineHoldStatus {
  if (code === "H") return "HELD";
  if (code === "R") return "RELEASED";
  if (code === "C") return "CANCELLED";

  throw new Error("INVALID_HOLD_STATE");
}

export function encodeHoldState(state: PineHoldState) {
  const extra =
    state.status === "RELEASED"
      ? state.signing_reference ?? ""
      : state.status === "CANCELLED"
        ? state.cancellation_reason ?? ""
        : "";

  return [
    "v1",
    state.hold_id,
    statusCode(state.status),
    encodeURIComponent(extra),
  ].join(":");
}

export function decodeHoldState(token: string): PineHoldState {
  try {
    const parts = token.split(":");

    if (parts.length !== 4 || parts[0] !== "v1") {
      throw new Error();
    }

    const hold_id = parts[1];
    const status = decodeStatus(parts[2]);
    const extra = decodeURIComponent(parts[3] || "");

    if (!hold_id.startsWith("HOLD-")) {
      throw new Error();
    }

    return {
      hold_id,
      status,
      ...(status === "RELEASED" && extra
        ? { signing_reference: extra }
        : {}),
      ...(status === "CANCELLED" && extra
        ? { cancellation_reason: extra }
        : {}),
    };
  } catch {
    throw new Error("INVALID_HOLD_STATE");
  }
}