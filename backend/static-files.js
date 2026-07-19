import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { securityHeaders, sendJson } from "./middleware.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const staticRoot = path.resolve(__dirname, "..");

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

function normalizeRequestPath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split("?")[0]);
  } catch (e) {
    return null;
  }
  const withoutLeadingSlash = decoded.replace(/^\/+/, "");
  const normalized = path.normalize(withoutLeadingSlash || "index.html");
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
    return null;
  }
  return normalized;
}

async function resolveFile(reqPath) {
  const normalized = normalizeRequestPath(reqPath);
  if (!normalized) return null;

  const directPath = path.join(staticRoot, normalized);
  try {
    const s = await stat(directPath);
    if (s.isFile()) return directPath;
  } catch {}

  return path.join(staticRoot, "index.html");
}

export async function serveStatic(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const filePath = await resolveFile(req.url || "/");
  if (!filePath) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

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
}
