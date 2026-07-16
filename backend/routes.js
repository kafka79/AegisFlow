import { serverEngine, MAX_MESSAGE_SIZE } from "./engine.js";

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_MESSAGE_SIZE) {
        req.destroy(new Error("Request body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve(null);
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

function sendJson(res, statusCode, payload, securityHeaders) {
  res.writeHead(statusCode, {
    ...securityHeaders,
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(payload));
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {Record<string, string>} securityHeaders
 */
export async function handleApiRequest(req, res, securityHeaders) {
  await serverEngine.init();

  const url = new URL(req.url || "/", "http://localhost");
  const path = url.pathname;
  const token = getBearerToken(req);
  const csrfToken = req.headers["x-csrf-token"] || null;

  try {
    if (req.method === "POST" && path === "/api/test/reset") {
      await serverEngine.reset();
      return sendJson(res, 200, { success: true }, securityHeaders);
    }

    if (req.method === "POST" && path === "/api/auth/login") {
      const body = await readJsonBody(req);
      const result = await serverEngine.authenticate(body.loginVal, body.password);
      return sendJson(res, 200, result, securityHeaders);
    }

    if (req.method === "POST" && path === "/api/auth/verify") {
      const body = await readJsonBody(req);
      const result = await serverEngine.verifySession(body.token, body.csrfToken ?? null);
      return sendJson(res, 200, result, securityHeaders);
    }

    if (req.method === "POST" && path === "/api/auth/register") {
      const body = await readJsonBody(req);
      const result = await serverEngine.registerUser(
        body.employeeDetails,
        body.password,
        body.token ?? token,
        body.csrfToken ?? csrfToken
      );
      return sendJson(res, 200, result, securityHeaders);
    }

    if (req.method === "GET" && path === "/api/employees") {
      const employees = await serverEngine.getEmployees(token);
      return sendJson(res, 200, employees, securityHeaders);
    }

    if (req.method === "POST" && path === "/api/sync") {
      const body = await readJsonBody(req);
      const result = await serverEngine.syncTransactions(token, body.transactions, csrfToken);
      return sendJson(res, 200, result, securityHeaders);
    }

    if (req.method === "GET" && path === "/api/admin/setup-notice") {
      const notice = await serverEngine.getAdminSetupNotice();
      return sendJson(res, 200, { notice }, securityHeaders);
    }

    if (req.method === "GET" && path === "/api/config/payroll") {
      const payrollConfig = await serverEngine.getPayrollConfig();
      return sendJson(res, 200, payrollConfig, securityHeaders);
    }

    if (req.method === "GET" && path === "/api/sync/version") {
      const result = await serverEngine.getSyncProtocolVersion();
      return sendJson(res, 200, result, securityHeaders);
    }

    const docMatch = path.match(/^\/api\/documents\/([^/]+)$/);
    if (docMatch) {
      const docId = decodeURIComponent(docMatch[1]);
      if (req.method === "POST") {
        const body = await readJsonBody(req);
        await serverEngine.saveDocument(token, docId, body.data, csrfToken);
        return sendJson(res, 200, { success: true }, securityHeaders);
      }
      if (req.method === "GET") {
        const data = await serverEngine.getDocument(token, docId);
        return sendJson(res, 200, { data }, securityHeaders);
      }
      if (req.method === "DELETE") {
        await serverEngine.deleteDocument(token, docId, csrfToken);
        res.writeHead(204, securityHeaders);
        return res.end();
      }
    }

    return sendJson(res, 404, { error: "Not found" }, securityHeaders);
  } catch (err) {
    return sendJson(res, 400, { error: err.message || "Bad request" }, securityHeaders);
  }
}
