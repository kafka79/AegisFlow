/**
 * Browser HTTP client for the Node backend API.
 * @typedef {import('./api-types.js').LoginResponse} LoginResponse
 * @typedef {import('./api-types.js').SyncResponse} SyncResponse
 * @param {string} [baseUrl=""]
 */
export function createHttpClient(baseUrl = "") {
  async function request(path, { method = "GET", body, token, csrfToken } = {}) {
    const headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;
    if (csrfToken) headers["X-CSRF-Token"] = csrfToken;

    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });

    if (res.status === 204) return null;

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload.error || res.statusText || "Request failed");
    }
    return payload;
  }

  return {
    async init() {},

    authenticate(loginVal, password) {
      return request("/api/auth/login", { method: "POST", body: { loginVal, password } });
    },

    verifySession(token, csrfToken = null) {
      return request("/api/auth/verify", {
        method: "POST",
        body: { token, csrfToken }
      });
    },

    registerUser(employeeDetails, password, token = null, csrfToken = null) {
      return request("/api/auth/register", {
        method: "POST",
        body: { employeeDetails, password, token, csrfToken },
        token: token || undefined,
        csrfToken: csrfToken || undefined
      });
    },

    getEmployees(token) {
      return request("/api/employees", { token });
    },

    syncTransactions(token, transactions, csrfToken = null) {
      return request("/api/sync", {
        method: "POST",
        body: { transactions },
        token,
        csrfToken
      });
    },

    async saveDocument(token, docId, docBlob, csrfToken = null) {
      let data = docBlob;
      if (typeof docBlob !== "string") {
        const bytes = new Uint8Array(docBlob);
        let binary = '';
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        data = btoa(binary);
      }
      return request(`/api/documents/${encodeURIComponent(docId)}`, {
        method: "POST",
        body: { data },
        token,
        csrfToken
      });
    },

    async getDocument(token, docId) {
      const result = await request(`/api/documents/${encodeURIComponent(docId)}`, { token });
      return result?.data ?? null;
    },

    deleteDocument(token, docId, csrfToken = null) {
      return request(`/api/documents/${encodeURIComponent(docId)}`, {
        method: "DELETE",
        token,
        csrfToken
      });
    },

    getAdminSetupNotice() {
      return request("/api/admin/setup-notice");
    },

    getPayrollConfig() {
      return request("/api/config/payroll");
    }
  };
}
