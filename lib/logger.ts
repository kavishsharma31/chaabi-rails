export type ConnectorLog = {
  timestamp: string;
  connector: string;
  endpoint: string;
  method: string;
  request: unknown;
  response: unknown;
  status_code: number;
  latency_ms: number;
};

export function logConnectorCall(log: ConnectorLog) {
  console.log(
    JSON.stringify({
      type: "connector_call",
      ...log,
    })
  );
}