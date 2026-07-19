import { securityHeaders, sendJson, readRequestBody } from "./middleware.js";

const metrics = {
  httpRequests: new Map(),
  syncSuccess: 0,
  syncFailure: 0,
  syncConflict: 0,
  telemetryEvents: 0
};

export function recordHttpRequest(method, route) {
  const key = `${method} ${route}`;
  metrics.httpRequests.set(key, (metrics.httpRequests.get(key) || 0) + 1);
}

function recordTelemetry(payload) {
  metrics.telemetryEvents += 1;
  if (typeof payload.successCount === "number") metrics.syncSuccess = payload.successCount;
  if (typeof payload.failureCount === "number") metrics.syncFailure = payload.failureCount;
  if (typeof payload.conflictCount === "number") metrics.syncConflict = payload.conflictCount;
}

function formatPrometheusMetrics() {
  const lines = [
    "# HELP workforces_app_up Whether the static app server is running.",
    "# TYPE workforces_app_up gauge",
    "workforces_app_up 1",
    "# HELP http_requests_total Total HTTP requests handled by the static server.",
    "# TYPE http_requests_total counter",
    "# HELP sync_operations_total Sync counters reported by client telemetry beacons.",
    "# TYPE sync_operations_total counter",
    "# HELP workforces_telemetry_events_total Telemetry beacons received from the browser client.",
    "# TYPE workforces_telemetry_events_total counter",
    `workforces_telemetry_events_total ${metrics.telemetryEvents}`,
    `sync_operations_total{status="success"} ${metrics.syncSuccess}`,
    `sync_operations_total{status="failure"} ${metrics.syncFailure}`,
    `sync_operations_total{status="conflict"} ${metrics.syncConflict}`
  ];
  for (const [key, count] of metrics.httpRequests.entries()) {
    const spaceIndex = key.indexOf(" ");
    const method = key.slice(0, spaceIndex);
    const route = key.slice(spaceIndex + 1);
    lines.push(`http_requests_total{method="${method}",path="${route}"} ${count}`);
  }
  return `${lines.join("\n")}\n`;
}

export async function handleHealth(req, res) {
  recordHttpRequest("GET", "/health");
  sendJson(res, 200, { status: "ok", timestamp: new Date().toISOString() });
}

export async function handleMetrics(req, res) {
  recordHttpRequest("GET", "/metrics");
  const body = formatPrometheusMetrics();
  res.writeHead(200, {
    ...securityHeaders,
    "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

export async function handleTelemetry(req, res) {
  recordHttpRequest("POST", "/api/telemetry");
  try {
    const body = await readRequestBody(req);
    if (body) recordTelemetry(JSON.parse(body));
  } catch (err) {
    console.warn("Telemetry parse error:", err.message);
  }
  res.writeHead(204, securityHeaders);
  res.end();
}
