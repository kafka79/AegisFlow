import { checkConnectionLimit, releaseConnection, checkRateLimitRequest } from "./engine.js";
import crypto from "node:crypto";

export const MAX_MESSAGE_SIZE = 1024 * 1024;

/**
 * Generate a CSP nonce for inline styles.
 * Usage: pass the nonce to the HTML template via res.locals.cspNonce.
 */
export function generateCspNonce() {
  return crypto.randomBytes(16).toString("base64url");
}

/**
 * Build a Content-Security-Policy header.
 * In production, remove `'unsafe-inline'` from style-src and use the nonce
 * parameter on every <style> tag: <style nonce="${nonce}">.
 * The renderer (renderer.js) can be updated to add nonce to generated <style> elements.
 */
export function buildCsp(nonce = null) {
  const styleSrc = nonce
    ? `'self' 'nonce-${nonce}' https://fonts.googleapis.com`
    : `'self' 'unsafe-inline' https://fonts.googleapis.com`;
  const scriptSrc = nonce
    ? `'self' 'nonce-${nonce}' blob:`
    : `'self' blob:`;
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    `style-src ${styleSrc}`,
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "frame-ancestors 'none'"
  ].join("; ");
}

export const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": buildCsp()
};

export function applyConnectionLimit(req, res) {
  const clientIp = req.socket.remoteAddress || "unknown";
  if (!checkConnectionLimit(clientIp)) {
    sendJson(res, 503, { error: "Service unavailable" });
    return false;
  }
  res.on("close", () => { releaseConnection(clientIp); });
  return true;
}

export function applyRateLimit(req, res) {
  const clientIp = req.socket.remoteAddress || "unknown";
  if (!checkRateLimitRequest(clientIp)) {
    sendJson(res, 429, { error: "Too many requests" });
    return false;
  }
  return true;
}

export function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    ...securityHeaders,
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

export function readRequestBody(req) {
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

let currentRequestId = 0;
export function getRequestId() {
  return ++currentRequestId;
}
