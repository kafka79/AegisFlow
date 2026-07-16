import { createHash, randomBytes, randomUUID, timingSafeEqual, pbkdf2, createHmac } from "node:crypto";
import { mergeFieldsWithFieldClocks } from "../src/merge.js";
import { ensureLocalStorage } from "./polyfill.js";
import { createStore } from "./store.js";
import { recordsNeedMerge, hasConcurrentFieldConflict } from "./sync-helpers.js";

import { CRYPTO_CONFIG } from "../src/crypto.js";

export const MAX_MESSAGE_SIZE = 1024 * 1024;
const MAX_CONNECTIONS_PER_IP = 50;
const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX_REQUESTS = 100;

const {
  PBKDF2_ITERATIONS,
  SALT_LENGTH,
  HMAC_KEY_LENGTH,
  SESSION_TTL_MS,
  MAX_LOGIN_ATTEMPTS,
  LOGIN_LOCKOUT_MS
} = CRYPTO_CONFIG;

// Map other variables to Node-compatible values/names
const PBKDF2_KEYLEN = CRYPTO_CONFIG.PBKDF2_KEY_LENGTH / 8; // 256 / 8 = 32
const PBKDF2_DIGEST = CRYPTO_CONFIG.PBKDF2_HASH.toLowerCase().replace("-", ""); // "sha256"

/** @type {Array<{ kid: string, value: string, createdAt: number }>} */
let hmacKeys = [];
const connectionCounts = new Map();
const requestCounts = new Map();
const loginAttempts = new Map();

function generateSalt() {
  return randomBytes(SALT_LENGTH).toString("hex");
}

async function hashPassword(password, salt) {
  return new Promise((resolve, reject) => {
    pbkdf2(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey.toString("hex"));
    });
  });
}

async function verifyPassword(password, salt, storedHash) {
  const computedHash = await hashPassword(password, salt);
  return timingSafeEqual(Buffer.from(computedHash), Buffer.from(storedHash));
}

function generateHmacKey() {
  return randomBytes(HMAC_KEY_LENGTH).toString("hex");
}

function sortObjectKeys(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sortObjectKeys);
  return Object.keys(obj).sort().reduce((acc, key) => {
    acc[key] = sortObjectKeys(obj[key]);
    return acc;
  }, {});
}

async function signSessionToken(payload, hmacKey, kid = null) {
  const sortedPayload = sortObjectKeys(payload);
  const payloadStr = JSON.stringify(sortedPayload);
  const key = Buffer.from(hmacKey, "hex");
  const hmac = createHmac("sha256", key).update(payloadStr).digest("hex");
  const tokenObj = { v: 1, payload: sortedPayload, sig: hmac, kid };
  return Buffer.from(JSON.stringify(tokenObj)).toString("base64");
}

async function verifySessionToken(token, hmacKey) {
  if (!token || typeof token !== "string") return null;
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    const payload = decoded.payload;
    const sig = decoded.sig;
    const sortedPayload = sortObjectKeys(payload);
    const payloadStr = JSON.stringify(sortedPayload);
    const key = Buffer.from(hmacKey, "hex");
    const expectedSig = createHmac("sha256", key).update(payloadStr).digest("hex");
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;
    if (payload.expiresAt && payload.expiresAt < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function extractKidFromToken(token) {
  if (!token || typeof token !== "string") return null;
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    return decoded.kid || null;
  } catch {
    return null;
  }
}

function getNewestHmacKey() {
  return hmacKeys.reduce((latest, k) => !latest || k.createdAt > latest.createdAt ? k : latest, null);
}

async function loadHmacKeys(store) {
  let keys = store.getConfig("hmac_keys") || [];
  const now = Date.now();

  if (keys.length === 0) {
    const legacy = store.getConfig("hmac_key");
    if (legacy) {
      keys = [{ kid: "kid_legacy", value: legacy, createdAt: now }];
    } else {
      const newKeyVal = await generateHmacKey();
      keys = [{
        kid: `kid_${randomUUID()}`,
        value: newKeyVal,
        createdAt: now
      }];
      await store.setConfig("hmac_keys", keys);
    }
  }

  // Keep only the newest key to simplify (removing dead rotation code)
  hmacKeys = [getNewestHmacKeyFrom(keys)];
}

function getNewestHmacKeyFrom(keys) {
  return keys.reduce((latest, k) => !latest || k.createdAt > latest.createdAt ? k : latest, null);
}

export function checkConnectionLimit(ip) {
  const count = connectionCounts.get(ip) || 0;
  if (count >= MAX_CONNECTIONS_PER_IP) return false;
  connectionCounts.set(ip, count + 1);
  return true;
}

export function releaseConnection(ip) {
  const count = connectionCounts.get(ip) || 0;
  if (count > 0) connectionCounts.set(ip, count - 1);
}

export function checkRateLimitRequest(ip) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  let requests = requestCounts.get(ip) || [];
  requests = requests.filter((t) => t > windowStart);
  if (requests.length >= RATE_LIMIT_MAX_REQUESTS) return false;
  requests.push(now);
  requestCounts.set(ip, requests);
  return true;
}

function checkRateLimit(identifier) {
  const now = Date.now();
  const attempts = loginAttempts.get(identifier) || { count: 0, firstAttempt: now, lockedUntil: 0 };

  if (attempts.lockedUntil && now > attempts.lockedUntil) {
    attempts.count = 0;
    attempts.firstAttempt = now;
    attempts.lockedUntil = 0;
    loginAttempts.set(identifier, attempts);
  }

  if (attempts.lockedUntil && now < attempts.lockedUntil) {
    const remainingMs = attempts.lockedUntil - now;
    throw new Error(`Too many failed attempts. Try again in ${Math.ceil(remainingMs / 60000)} minutes.`);
  }

  return attempts;
}

function recordFailedAttempt(identifier) {
  const now = Date.now();
  const attempts = loginAttempts.get(identifier) || { count: 0, firstAttempt: now, lockedUntil: 0 };
  attempts.count += 1;
  attempts.firstAttempt = attempts.firstAttempt || now;

  if (attempts.count >= MAX_LOGIN_ATTEMPTS) {
    attempts.lockedUntil = now + LOGIN_LOCKOUT_MS;
  }

  loginAttempts.set(identifier, attempts);
}

function clearFailedAttempts(identifier) {
  loginAttempts.delete(identifier);
}

/**
 * @param {{ memory?: boolean, filePath?: string }} [options]
 */
export function createEngine(options = {}) {
  const store = createStore(options);
  let ready = false;

  async function init() {
    ensureLocalStorage();
    await store.init();
    await loadHmacKeys(store);
    ready = true;
  }

  async function ensureReady() {
    if (!ready) await init();
  }

  return {
    init,
    store,

    async getAdminSetupNotice() {
      await ensureReady();
      return store.getConfig("admin_setup_notice");
    },

    async getPayrollConfig() {
      await ensureReady();
      const configVal = store.getConfig("payroll_config");
      if (configVal) return configVal;

      const defaultConfig = {
        pfCeiling: 15000,
        pfRate: 0.12,
        esiCeiling: 21000,
        esiEmployerRate: 0.0325,
        esiEmployeeRate: 0.0075,
        standardDeduction: 75000,
        professionalTaxSlabs: {
          maharashtra: [
            { limit: 7500, rate: 0 },
            { limit: 10000, rate: 175 },
            { limit: null, rate: 200, febRate: 250 }
          ],
          tamil_nadu: [
            { limit: 12000, rate: 0 },
            { limit: 21000, rate: 185 },
            { limit: 30000, rate: 195 },
            { limit: 45000, rate: 210 },
            { limit: 60000, rate: 235 },
            { limit: null, rate: 250 }
          ],
          telangana: [
            { limit: 15000, rate: 0 },
            { limit: 20000, rate: 150 },
            { limit: null, rate: 200 }
          ],
          delhi: [
            { limit: null, rate: 0 }
          ],
          default: [
            { limit: 15000, rate: 0 },
            { limit: null, rate: 200 }
          ]
        },
        tdsSlabs: [
          { limit: 300000, rate: 0, base: 0 },
          { limit: 600000, rate: 0.05, base: 0 },
          { limit: 900000, rate: 0.10, base: 15000 },
          { limit: 1200000, rate: 0.15, base: 45000 },
          { limit: 1500000, rate: 0.20, base: 90000 },
          { limit: null, rate: 0.30, base: 150000 }
        ]
      };
      await store.setConfig("payroll_config", defaultConfig);
      return defaultConfig;
    },

    async getSyncProtocolVersion() {
      await ensureReady();
      return {
        version: 2,
        minCompatibleVersion: 1,
        supportedFeatures: ["fieldClocks", "vectorClocks", "perFieldMerge"]
      };
    },

    async authenticate(loginVal, password) {
      await ensureReady();
      checkRateLimit(loginVal.toLowerCase());

      const users = store.getAll("users");
      const user = users.find(
        (u) =>
          u.email.toLowerCase() === loginVal.toLowerCase() ||
          u.employeeId.toLowerCase() === loginVal.toLowerCase()
      );

      if (!user) {
        recordFailedAttempt(loginVal.toLowerCase());
        throw new Error("Invalid username or password.");
      }

      const isValid = await verifyPassword(password, user.salt, user.password);
      if (!isValid) {
        recordFailedAttempt(loginVal.toLowerCase());
        throw new Error("Invalid username or password.");
      }

      clearFailedAttempts(loginVal.toLowerCase());

      const expiresAt = Date.now() + 2 * 60 * 60 * 1000;
      const csrfToken = randomUUID();
      const newestKey = getNewestHmacKey();
      const signedToken = await signSessionToken(
        {
          employeeId: user.employeeId,
          role: user.role,
          expiresAt,
          csrfToken
        },
        newestKey.value,
        newestKey.kid
      );
      const employee = store.get("employees", user.employeeId);
      return { token: signedToken, csrfToken, employee };
    },

    async verifySession(token, csrfToken = null) {
      await ensureReady();
      if (!token) return null;
      const kid = extractKidFromToken(token);
      let keyObj = hmacKeys.find((k) => k.kid === kid);
      if (!keyObj) keyObj = getNewestHmacKey();
      const payload = await verifySessionToken(token, keyObj ? keyObj.value : hmacKeys[0]?.value);
      if (!payload) throw new Error("Session signature verification failed.");
      if (payload.expiresAt < Date.now()) throw new Error("Session has expired.");
      if (csrfToken !== null && payload.csrfToken !== csrfToken) {
        throw new Error("CSRF token validation failed.");
      }
      return payload;
    },

    async registerUser(employeeDetails, password, token = null, csrfToken = null) {
      await ensureReady();
      const email = employeeDetails.email.toLowerCase().trim();
      const users = store.getAll("users");
      const existingUser = users.find((u) => u.employeeId === employeeDetails.id);

      if (existingUser) {
        if (!token) throw new Error("Authentication required to update user security credentials.");
        if (!csrfToken) throw new Error("CSRF token is required.");
        const session = await this.verifySession(token, csrfToken);
        if (session.employeeId !== employeeDetails.id && session.role !== "HR") {
          throw new Error("Unauthorized to update this user's password.");
        }
        const salt = generateSalt();
        existingUser.password = await hashPassword(password, salt);
        existingUser.salt = salt;
        await store.put("users", existingUser);
        return { token, csrfToken, employee: employeeDetails };
      }

      if (users.length > 0) {
        if (!token) throw new Error("Authorization token is required to register a user account.");
        if (!csrfToken) throw new Error("CSRF token is required.");
        const session = await this.verifySession(token, csrfToken);
        if (session.role !== "HR") throw new Error("Only HR personnel can register user accounts.");
      } else if (employeeDetails.role !== "HR") {
        throw new Error("The first workspace account must be an HR account.");
      }

      if (users.some((u) => u.email.toLowerCase() === email)) {
        throw new Error("A user with this Email already exists.");
      }

      const salt = generateSalt();
      const stretched = await hashPassword(password, salt);
      await store.put("users", {
        employeeId: employeeDetails.id,
        email,
        password: stretched,
        salt,
        role: employeeDetails.role
      });
      await store.put("employees", employeeDetails);

      const expiresAt = Date.now() + 2 * 60 * 60 * 1000;
      const newCsrf = randomUUID();
      const newestKey = getNewestHmacKey();
      const signedToken = await signSessionToken(
        {
          employeeId: employeeDetails.id,
          role: employeeDetails.role,
          expiresAt,
          csrfToken: newCsrf
        },
        newestKey.value,
        newestKey.kid
      );
      return { token: signedToken, csrfToken: newCsrf, employee: employeeDetails };
    },

    async getEmployees(token) {
      await ensureReady();
      const session = await this.verifySession(token);
      if (session.role === "HR") return store.getAll("employees");
      const self = store.get("employees", session.employeeId);
      return self ? [self] : [];
    },

    async syncTransactions(token, transactions, csrfToken = null) {
      await ensureReady();
      if (!csrfToken) throw new Error("CSRF token is required.");
      const session = await this.verifySession(token, csrfToken);
      const serverTimestamp = Date.now();
      let conflicts = 0;
      /** @type {Array<{ id: number|string, status: string, error?: string }>} */
      const results = [];

      const CHUNK_SIZE = 50;
      for (let i = 0; i < transactions.length; i += CHUNK_SIZE) {
        const chunk = transactions.slice(i, i + CHUNK_SIZE);

        for (const trx of chunk) {
          const { id, type, store: storeName, data } = trx;
          try {
            const keyField = storeName === "users" ? "employeeId" : "id";
            const key = data[keyField];
            if (!key) throw new Error("Missing key path field.");

            const existing = store.get(storeName, key);
            const clientId = session.employeeId;
            const clientVectorClock = data.vectorClock || {};

            const serverFieldClocks = existing?.fieldClocks || {};
            const clientFieldClocks = data.fieldClocks || {};
            const hasServerClocks = Object.keys(serverFieldClocks).length > 0;

            if (hasServerClocks) {
              const validatedFieldClocks = {};
              for (const [field, clientClock] of Object.entries(clientFieldClocks)) {
                const serverClock = serverFieldClocks[field] || 0;
                validatedFieldClocks[field] = Math.min(clientClock, serverClock + 1);
              }
              data.fieldClocks = validatedFieldClocks;
            }

            if (session.role !== "HR") {
              if (storeName === "employees") {
                if (key !== session.employeeId) {
                  throw new Error(`Unauthorized modification of employee ${key}`);
                }
                if (existing) {
                  data.role = existing.role;
                  data.department = existing.department;
                  data.manager = existing.manager;
                  data.wage = existing.wage;
                  data.location = existing.location;
                  data.dateOfJoining = existing.dateOfJoining;
                  data.ptoDays = existing.ptoDays;
                  data.sickDays = existing.sickDays;
                } else {
                  throw new Error("Non-HR cannot add new employee records.");
                }
              } else if (storeName === "users") {
                if (key !== session.employeeId) {
                  throw new Error(`Unauthorized modification of user credentials ${key}`);
                }
                if (existing) data.role = existing.role;
                else throw new Error("Non-HR cannot register new users.");
              } else if (storeName === "attendance") {
                if (data.employeeId !== session.employeeId) {
                  throw new Error(`Unauthorized modification of attendance for employee ${data.employeeId}`);
                }
              } else if (storeName === "timeoff") {
                if (data.employeeId !== session.employeeId) {
                  throw new Error(`Unauthorized modification of timeoff for employee ${data.employeeId}`);
                }
                if (existing) {
                  data.status = existing.status;
                  data.comment = existing.comment;
                } else {
                  data.status = "Pending";
                  data.comment = "";
                }
              } else {
                throw new Error(`Unauthorized modification of store ${storeName}`);
              }
            }

            if (type === "PUT" || type === "ADD" || type === "UPDATE") {
              if (!existing) {
                data.lastModified = serverTimestamp;
                await store.put(storeName, data);
                results.push({ id, status: "success" });
              } else if (recordsNeedMerge(data, existing)) {
                const merged = mergeFieldsWithFieldClocks(data, existing);
                merged.lastModified = serverTimestamp;
                await store.put(storeName, merged);
                const concurrent = hasConcurrentFieldConflict(data, existing);
                if (concurrent) conflicts += 1;
                results.push({ id, status: concurrent ? "conflict" : "success" });
              } else {
                results.push({ id, status: "success" });
              }
            } else if (type === "DELETE") {
              if (session.role !== "HR") {
                throw new Error("Unauthorized deletion. Only HR can delete records.");
              }
              if (!existing) {
                results.push({ id, status: "success" });
              } else {
                await store.delete(storeName, key);
                if (storeName === "employees") await store.delete("users", key);
                results.push({ id, status: "success" });
              }
            }
          } catch (err) {
            results.push({ id, status: "error", error: err.message || String(err) });
          }
        }
        
        // Yield to the event loop after processing a chunk
        await new Promise(resolve => setImmediate(resolve));
      }

      return { success: true, conflicts, results, timestamp: serverTimestamp };
    },

    async saveDocument(token, docId, docBlob, csrfToken = null) {
      await ensureReady();
      if (!csrfToken) throw new Error("CSRF token is required.");
      await this.verifySession(token, csrfToken);
      await store.put("documents", { id: docId, data: docBlob });
      return { success: true };
    },

    async getDocument(token, docId) {
      await ensureReady();
      await this.verifySession(token);
      const docObj = store.get("documents", docId);
      return docObj ? docObj.data : null;
    },

    async deleteDocument(token, docId, csrfToken = null) {
      await ensureReady();
      if (!csrfToken) throw new Error("CSRF token is required.");
      await this.verifySession(token, csrfToken);
      await store.delete("documents", docId);
      return { success: true };
    },

    async reset() {
      console.log("[DEBUG] reset: clearing store and hmacKeys");
      await store.clear();
      hmacKeys = [];
      ready = false;
    }
  };
}

/** Shared singleton for the Node HTTP server process. */
export const serverEngine = createEngine({
  memory: process.env.WORKFORCES_MEMORY_DB === "1",
  filePath: process.env.WORKFORCES_DB_PATH
});
