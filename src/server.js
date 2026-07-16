import { createHttpClient } from "./api-http.js";

const useHttpClient = typeof window !== "undefined" && !import.meta.env?.VITEST;

/** @type {any} */
let cachedApi = null;

async function resolveApi() {
  if (cachedApi) return cachedApi;
  if (useHttpClient) {
    cachedApi = createHttpClient("");
  } else {
    const { createEngine } = await import("../backend/engine.js");
    cachedApi = createEngine({ memory: true });
    await cachedApi.init();
  }
  return cachedApi;
}

/** @type {import('../backend/engine.js').createEngine extends (...args: any) => infer R ? R : never} */
export const MockServer = {
  async init() {
    return (await resolveApi()).init();
  },
  async getAdminSetupNotice() {
    return (await resolveApi()).getAdminSetupNotice();
  },
  async authenticate(loginVal, password) {
    return (await resolveApi()).authenticate(loginVal, password);
  },
  async verifySession(token, csrfToken = null) {
    return (await resolveApi()).verifySession(token, csrfToken);
  },
  async registerUser(employeeDetails, password, token = null, csrfToken = null) {
    return (await resolveApi()).registerUser(employeeDetails, password, token, csrfToken);
  },
  async getEmployees(token) {
    return (await resolveApi()).getEmployees(token);
  },
  async syncTransactions(token, transactions, csrfToken = null) {
    return (await resolveApi()).syncTransactions(token, transactions, csrfToken);
  },
  async saveDocument(token, docId, docBlob, csrfToken = null) {
    return (await resolveApi()).saveDocument(token, docId, docBlob, csrfToken);
  },
  async getDocument(token, docId) {
    return (await resolveApi()).getDocument(token, docId);
  },
  async deleteDocument(token, docId, csrfToken = null) {
    return (await resolveApi()).deleteDocument(token, docId, csrfToken);
  },
  async getPayrollConfig() {
    return (await resolveApi()).getPayrollConfig();
  },
  async getSyncProtocolVersion() {
    return (await resolveApi()).getSyncProtocolVersion();
  }
};

Object.freeze(MockServer);
