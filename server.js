import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleApiRequest } from "./backend/routes.js";
import { serverEngine, MAX_MESSAGE_SIZE, checkConnectionLimit, releaseConnection, checkRateLimitRequest } from "./backend/engine.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";

const staticRoot = __dirname;
const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".ico", "image/x-icon"],
  [".txt", "text/plain; charset=utf-8"]
]);

const metrics = {
  httpRequests: new Map(),
  syncSuccess: 0,
  syncFailure: 0,
  syncConflict: 0,
  telemetryEvents: 0
};

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' blob:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "frame-ancestors 'none'"
  ].join("; ")
};

function recordHttpRequest(method, route) {
  const key = `${method} ${route}`;
  metrics.httpRequests.set(key, (metrics.httpRequests.get(key) || 0) + 1);
}

function recordTelemetry(payload) {
  metrics.telemetryEvents += 1;
  if (typeof payload.successCount === "number") {
    metrics.syncSuccess = payload.successCount;
  }
  if (typeof payload.failureCount === "number") {
    metrics.syncFailure = payload.failureCount;
  }
  if (typeof payload.conflictCount === "number") {
    metrics.syncConflict = payload.conflictCount;
  }
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

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    ...securityHeaders,
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(payload));
}

function normalizeRequestPath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const withoutLeadingSlash = decoded.replace(/^\/+/, "");
  const normalized = path.normalize(withoutLeadingSlash || "index.html");
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
    return null;
  }
  return normalized;
}

async function resolveStaticFile(reqPath) {
  const normalized = normalizeRequestPath(reqPath);
  if (!normalized) return null;

  const directPath = path.join(staticRoot, normalized);
  try {
    const directStat = await stat(directPath);
    if (directStat.isFile()) return directPath;
  } catch {}

  return path.join(staticRoot, "index.html");
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let length = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      length += chunk.length;
      if (length > MAX_MESSAGE_SIZE) {
        req.destroy(new Error("Payload too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  const clientIp = req.socket.remoteAddress || "unknown";
  
  if (!checkConnectionLimit(clientIp)) {
    sendJson(res, 503, { error: "Service unavailable" });
    return;
  }
  
  res.on("close", () => {
    releaseConnection(clientIp);
  });

  if (!checkRateLimitRequest(clientIp)) {
    sendJson(res, 429, { error: "Too many requests" });
    return;
  }

  const route = (req.url || "/").split("?")[0];

  try {
    if (req.method === "GET" && route === "/health") {
      recordHttpRequest("GET", "/health");
      sendJson(res, 200, { status: "ok", timestamp: new Date().toISOString() });
      return;
    }

    if (req.method === "GET" && route === "/metrics") {
      recordHttpRequest("GET", "/metrics");
      res.writeHead(200, {
        ...securityHeaders,
        "Content-Type": "text/plain; version=0.0.4; charset=utf-8"
      });
      res.end(formatPrometheusMetrics());
      return;
    }

    if (req.method === "POST" && route === "/api/telemetry") {
      recordHttpRequest("POST", "/api/telemetry");
      try {
        const body = await readRequestBody(req);
        if (body) {
          recordTelemetry(JSON.parse(body));
        }
      } catch (err) {
        console.warn("Telemetry parse error:", err.message);
      }
      res.writeHead(204, securityHeaders);
      res.end();
      return;
    }

    if (route.startsWith("/api/")) {
      recordHttpRequest(req.method, route);
      return handleApiRequest(req, res, securityHeaders);
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      recordHttpRequest(req.method, route);
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const filePath = await resolveStaticFile(req.url || "/");
    if (!filePath) {
      recordHttpRequest(req.method, route);
      sendJson(res, 403, { error: "Forbidden" });
      return;
    }

    recordHttpRequest(req.method, route === "/" ? "/" : route);

    const ext = path.extname(filePath);
    const contentType = mimeTypes.get(ext) || "application/octet-stream";
    const cacheControl = ext === ".html" ? "no-cache" : "public, max-age=3600";

    res.writeHead(200, {
      ...securityHeaders,
      "Content-Type": contentType,
      "Cache-Control": cacheControl
    });

    if (req.method === "HEAD") {
      res.end();
      return;
    }

    createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error("Server error:", err);
    sendJson(res, 500, { error: "Internal server error" });
  }
});

server.listen(PORT, HOST, async () => {
  await serverEngine.init();
  console.log(`WorkForces HRMS server listening on http://${HOST}:${PORT}`);
});
