import { hashPassword, generateSalt, generateHmacKey, signSessionToken, verifySessionToken, checkRateLimit, recordFailedAttempt, clearFailedAttempts, verifyPassword } from "./crypto.js";
import { mergeFieldsWithFieldClocks } from "./merge.js";

/**
 * Browser-local mock backend for the portfolio demo.
 * Uses a separate IndexedDB namespace in the same browser origin to exercise auth,
 * RBAC, and sync flows. This is not an isolated production backend service.
 */

const DB_NAME = "workforces_server_db";
const DB_VERSION = 2;
let db = null;
let hmacKeys = [];

const MAX_MESSAGE_SIZE = 1024 * 1024;
const MAX_CONNECTIONS_PER_IP = 50;
const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX_REQUESTS = 100;
const connectionCounts = new Map();
const requestCounts = new Map();

function initServerDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = (e) => reject(e.target.error);
    request.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };
    
    request.onupgradeneeded = (e) => {
      const activeDb = e.target.result;
      if (!activeDb.objectStoreNames.contains("users")) {
        activeDb.createObjectStore("users", { keyPath: "employeeId" });
      }
      if (!activeDb.objectStoreNames.contains("employees")) {
        activeDb.createObjectStore("employees", { keyPath: "id" });
      }
      if (!activeDb.objectStoreNames.contains("documents")) {
        activeDb.createObjectStore("documents", { keyPath: "id" });
      }
      if (!activeDb.objectStoreNames.contains("attendance")) {
        activeDb.createObjectStore("attendance", { keyPath: "id" });
      }
      if (!activeDb.objectStoreNames.contains("timeoff")) {
        activeDb.createObjectStore("timeoff", { keyPath: "id" });
      }
      if (!activeDb.objectStoreNames.contains("config")) {
        activeDb.createObjectStore("config", { keyPath: "key" });
      }
    };
  });
}

function extractKidFromToken(token) {
  if (!token || typeof token !== "string") return null;
  try {
    const decoded = JSON.parse(decodeURIComponent(escape(atob(token))));
    return decoded.kid || null;
  } catch {
    return null;
  }
}

function getNewestHmacKey() {
  return hmacKeys.reduce((latest, k) => !latest || k.createdAt > latest.createdAt ? k : latest, null);
}

async function loadHmacKeys() {
  const transaction = db.transaction("config", "readonly");
  const store = transaction.objectStore("config");
  return new Promise((resolve) => {
    const request = store.get("hmac_keys");
    request.onsuccess = async () => {
      let keys = request.result?.value || [];
      const now = Date.now();
      
      if (keys.length === 0) {
        // Fallback check for old legacy hmac_key
        const legacyReq = store.get("hmac_key");
        await new Promise((legacyResolve) => {
          legacyReq.onsuccess = () => {
            if (legacyReq.result) {
              keys = [{
                kid: "kid_legacy",
                value: legacyReq.result.value,
                createdAt: Date.now()
              }];
            }
            legacyResolve();
          };
          legacyReq.onerror = () => legacyResolve();
        });
      }
      
      // Filter out keys older than 30 days
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
      keys = keys.filter(k => k.createdAt > thirtyDaysAgo);
      
      // Rotate if newest key is older than 7 days
      const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
      const newestKey = keys.reduce((latest, k) => !latest || k.createdAt > latest.createdAt ? k : latest, null);
      
      if (!newestKey || newestKey.createdAt < sevenDaysAgo) {
        const newKeyVal = await generateHmacKey();
        const newKey = {
          kid: "kid_" + crypto.randomUUID(),
          value: newKeyVal,
          createdAt: now
        };
        keys.push(newKey);
        
        // Write back updated keys list
        const writeTx = db.transaction("config", "readwrite");
        writeTx.objectStore("config").put({ key: "hmac_keys", value: keys });
      }
      
      hmacKeys = keys;
      resolve();
    };
    request.onerror = () => resolve();
  });
}

function checkConnectionLimit(ip) {
  const count = connectionCounts.get(ip) || 0;
  if (count >= MAX_CONNECTIONS_PER_IP) {
    return false;
  }
  connectionCounts.set(ip, count + 1);
  return true;
}

function releaseConnection(ip) {
  const count = connectionCounts.get(ip) || 0;
  if (count > 0) {
    connectionCounts.set(ip, count - 1);
  }
}

function checkRateLimitRequest(ip) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  
  let requests = requestCounts.get(ip) || [];
  requests = requests.filter(t => t > windowStart);
  
  if (requests.length >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  
  requests.push(now);
  requestCounts.set(ip, requests);
  return true;
}

function validateMessageSize(data) {
  const size = new TextEncoder().encode(JSON.stringify(data)).length;
  return size <= MAX_MESSAGE_SIZE;
}

async function authenticateWebSocket(ws, token) {
  try {
    const payload = await MockServer.verifySession(token);
    if (!payload) return null;
    return payload;
  } catch (err) {
    return null;
  }
}

// Helper to wrap IndexedDB store requests as Promises
function performTx(storeName, mode, callback) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const request = callback(store);
    
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = (e) => reject(e.target.error);
    request.onerror = (e) => reject(e.target.error);
  });
}

// Read helper for all elements
function getStoreAll(storeName) {
  return new Promise((resolve) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => resolve([]);
  });
}

// Mock Server API Engine
export const MockServer = {
  async init() {
    await initServerDB();
    await loadHmacKeys();
  },

  async getAdminSetupNotice() {
    const notice = await performTx("config", "readonly", (s) => s.get("admin_setup_notice"));
    return notice ? notice.value : null;
  },

  // Authenticate user & return signed session token
  async authenticate(loginVal, password) {
    // Rate limiting by login identifier (email or employeeId)
    checkRateLimit(loginVal.toLowerCase());
    
    const users = await getStoreAll("users");
    const user = users.find(u => 
      u.email.toLowerCase() === loginVal.toLowerCase() || 
      u.employeeId.toLowerCase() === loginVal.toLowerCase()
    );
    
    if (!user) {
      recordFailedAttempt(loginVal.toLowerCase());
      throw new Error("Invalid username or password.");
    }
    
    // Verify password using raw password (no pre-hashing)
    const isValid = await verifyPassword(password, user.salt, user.password);
    
    if (!isValid) {
      recordFailedAttempt(loginVal.toLowerCase());
      throw new Error("Invalid username or password.");
    }
    
    // Clear failed attempts on successful login
    clearFailedAttempts(loginVal.toLowerCase());
    
    // Generate session token valid for 2 hours
    const expiresAt = Date.now() + 2 * 60 * 60 * 1000;
    const csrfToken = crypto.randomUUID();
    const sessionPayload = {
      employeeId: user.employeeId,
      role: user.role,
      expiresAt: expiresAt,
      csrfToken: csrfToken
    };
    
    const newestKey = getNewestHmacKey();
    const signedToken = await signSessionToken(sessionPayload, newestKey.value, newestKey.kid);
    const employee = await performTx("employees", "readonly", (s) => s.get(user.employeeId));
    

    return { token: signedToken, csrfToken, employee };
  },

  // Verify signed token and return valid details or throw
  async verifySession(token, csrfToken = null) {
    if (!token) return null;
    const kid = extractKidFromToken(token);
    let keyObj = hmacKeys.find(k => k.kid === kid);
    if (!keyObj) {
      keyObj = getNewestHmacKey();
    }
    const payload = await verifySessionToken(token, keyObj ? keyObj.value : hmacKeys[0]?.value);
    if (!payload) throw new Error("Session signature verification failed.");
    
    if (payload.expiresAt < Date.now()) {
      throw new Error("Session has expired.");
    }
    
    if (csrfToken !== null && payload.csrfToken !== csrfToken) {
      throw new Error("CSRF token validation failed.");
    }
    return payload;
  },

  // Handle registrations securely (hashes password before server DB write)
  async registerUser(employeeDetails, password, token = null, csrfToken = null) {
    const email = employeeDetails.email.toLowerCase().trim();
    const users = await getStoreAll("users");
    
    // Check if the user is attempting a credentials/password update
    const existingUser = users.find(u => u.employeeId === employeeDetails.id);
    if (existingUser) {
      if (!token) {
        throw new Error("Authentication required to update user security credentials.");
      }
      const session = await this.verifySession(token, csrfToken);
      if (session.employeeId !== employeeDetails.id && session.role !== "HR") {
        throw new Error("Unauthorized to update this user's password.");
      }
      
      const salt = generateSalt();
      const stretched = await hashPassword(password, salt);
      existingUser.password = stretched;
      existingUser.salt = salt;
      
      const tx = db.transaction(["users", "config"], "readwrite");
      tx.objectStore("users").put(existingUser);

      return { token, csrfToken, employee: employeeDetails };
    }
    
    // New registration rules (RBAC / Auth checks)
    if (users.length > 0) {
      if (!token) {
        throw new Error("Authorization token is required to register a user account.");
      }
      const session = await this.verifySession(token, csrfToken);
      if (session.role !== "HR") {
        throw new Error("Only HR personnel can register user accounts.");
      }
    } else if (employeeDetails.role !== "HR") {
      throw new Error("The first workspace account must be an HR account.");
    }
    
    if (users.some(u => u.email.toLowerCase() === email)) {
      throw new Error("A user with this Email already exists.");
    }
    
    const salt = generateSalt();
    const stretched = await hashPassword(password, salt);
    
    const newUser = {
      employeeId: employeeDetails.id,
      email: email,
      password: stretched,
      salt: salt,
      role: employeeDetails.role
    };
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["users", "employees"], "readwrite");
      tx.objectStore("users").put(newUser);
      tx.objectStore("employees").put(employeeDetails);
      tx.oncomplete = async () => {
        const expiresAt = Date.now() + 2 * 60 * 60 * 1000;
        const newCsrf = crypto.randomUUID();
        const newestKey = getNewestHmacKey();
        const signedToken = await signSessionToken({
          employeeId: employeeDetails.id,
          role: employeeDetails.role,
          expiresAt: expiresAt,
          csrfToken: newCsrf
        }, newestKey.value, newestKey.kid);
        resolve({ token: signedToken, csrfToken: newCsrf, employee: employeeDetails });
      };
      tx.onerror = (e) => reject(e.target.error);
    });
  },

  // Retrieve employees (for HR or self)
  async getEmployees(token) {
    const session = await this.verifySession(token);
    if (session.role === "HR") {
      return await getStoreAll("employees");
    } else {
      const self = await performTx("employees", "readonly", (s) => s.get(session.employeeId));
      return [self];
    }
  },

  // Cloud Sync Handler - accepts mutation transactions from the client sync queue
  async syncTransactions(token, transactions, csrfToken = null) {
    const session = await this.verifySession(token, csrfToken);
    
    // Use server-side timestamp to prevent client clock drift
    const serverTimestamp = Date.now();
    let conflicts = 0;
    const results = [];
    
    for (const trx of transactions) {
      const { id, type, store, data } = trx;
      
      try {
        const res = await new Promise((resolve, reject) => {
          const tx = db.transaction([store, "users"], "readwrite");
          const targetStore = tx.objectStore(store);
          
          // Key path resolution: 'users' uses employeeId, others use id
          const key = store === "users" ? data.employeeId : data.id;
          if (!key) {
            reject(new Error("Missing key path field."));
            return;
          }
          
          const req = targetStore.get(key);
          req.onsuccess = () => {
            const existing = req.result;
            
            // Role-Based Access Control Checks
            if (session.role !== "HR") {
              if (store === "employees") {
                if (key !== session.employeeId) {
                  reject(new Error(`Unauthorized modification of employee ${key}`));
                  return;
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
                  reject(new Error("Non-HR cannot add new employee records."));
                  return;
                }
              } else if (store === "users") {
                if (key !== session.employeeId) {
                  reject(new Error(`Unauthorized modification of user credentials ${key}`));
                  return;
                }
                if (existing) {
                  data.role = existing.role;
                } else {
                  reject(new Error("Non-HR cannot register new users."));
                  return;
                }
              } else if (store === "attendance") {
                if (data.employeeId !== session.employeeId) {
                  reject(new Error(`Unauthorized modification of attendance for employee ${data.employeeId}`));
                  return;
                }
              } else if (store === "timeoff") {
                if (data.employeeId !== session.employeeId) {
                  reject(new Error(`Unauthorized modification of timeoff for employee ${data.employeeId}`));
                  return;
                }
                if (existing) {
                  data.status = existing.status;
                  data.comment = existing.comment;
                } else {
                  data.status = "Pending";
                  data.comment = "";
                }
              }
            }
            
            if (type === "PUT" || type === "ADD" || type === "UPDATE") {
              if (!existing || !existing.lastModified || existing.lastModified < serverTimestamp) {
                // No conflict or client is newer - apply client changes
                data.lastModified = serverTimestamp;
                const putReq = targetStore.put(data);
                putReq.onsuccess = () => resolve({ status: "success" });
                putReq.onerror = (e) => reject(e.target.error);
              } else {
                // CONFLICT: Both client and server have modifications
                conflicts++;
                const merged = mergeFieldsWithFieldClocks(data, existing);
                merged.lastModified = existing.lastModified || serverTimestamp;
                const putReq = targetStore.put(merged);
                putReq.onsuccess = () => resolve({ status: "conflict" });
                putReq.onerror = (e) => reject(e.target.error);
              }
            } else if (type === "DELETE") {
              if (session.role !== "HR") {
                reject(new Error("Unauthorized deletion. Only HR can delete records."));
                return;
              }
              if (!existing) {
                resolve({ status: "success" });
              } else if (!existing.lastModified || existing.lastModified < serverTimestamp) {
                const delReq = targetStore.delete(key);
                delReq.onsuccess = () => {
                  if (store === "employees") {
                    tx.objectStore("users").delete(key);
                  }
                  resolve({ status: "success" });
                };
                delReq.onerror = (e) => reject(e.target.error);
              } else {
                conflicts++;
                resolve({ status: "conflict" });
              }
            }
          };
          req.onerror = (e) => reject(e.target.error);
          tx.onerror = (e) => reject(e.target.error);
        });
        results.push({ id, status: res.status });
      } catch (err) {
        results.push({ id, status: "error", error: err.message || String(err) });
      }
    }
    
    return { success: true, conflicts, results, timestamp: serverTimestamp };
  },

  // WebSocket connection handler with auth and rate limiting
  async handleWebSocketConnection(ws, req) {
    const ip = req.socket?.remoteAddress || req.headers?.["x-forwarded-for"] || "unknown";
    
    // Check connection limit per IP
    if (!checkConnectionLimit(ip)) {
      ws.close(1013, "Too many connections from this IP");
      return;
    }
    
    ws.on("close", () => {
      releaseConnection(ip);
    });
    
    ws.on("error", (err) => {
      console.error("[SERVER] WebSocket error:", err);
    });
    
    // Authenticate first message
    let authenticated = false;
    let session = null;
    
    ws.on("message", async (data) => {
      try {
        // Rate limiting
        if (!checkRateLimitRequest(ip)) {
          ws.close(1009, "Rate limit exceeded");
          return;
        }
        
        // Message size limit
        if (data.length > MAX_MESSAGE_SIZE) {
          ws.close(1009, "Message too large");
          return;
        }
        
        const message = JSON.parse(data.toString());
        
        if (!authenticated) {
          if (message.type === "auth") {
            try {
              session = await MockServer.verifySession(message.token, message.csrfToken);
              authenticated = true;
              ws.send(JSON.stringify({ type: "auth_success", session }));
            } catch (err) {
              ws.close(1008, "Authentication failed: " + err.message);
            }
          } else {
            ws.close(1008, "First message must be auth");
          }
          return;
        }
        
        // Handle authenticated messages
        switch (message.type) {
          case "sync_batch":
            const syncResult = await MockServer.syncTransactions(message.token, message.mutations, message.csrfToken);
            ws.send(JSON.stringify({ type: "sync_result", batchId: message.batchId, ...syncResult }));
            break;
            
          case "ping":
            ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
            break;
            
          default:
            ws.send(JSON.stringify({ type: "error", error: "Unknown message type" }));
        }
      } catch (err) {
        if (err instanceof SyntaxError) {
          ws.close(1003, "Invalid JSON");
        } else {
          console.error("[SERVER] WS message error:", err);
          ws.send(JSON.stringify({ type: "error", error: err.message }));
        }
      }
    });
  },

  // Direct File/Document handlers
  async saveDocument(token, docId, docBlob, csrfToken = null) {
    await this.verifySession(token, csrfToken);
    await performTx("documents", "readwrite", (s) => s.put({ id: docId, data: docBlob }));
    return { success: true };
  },

  async getDocument(token, docId) {
    await this.verifySession(token);
    const docObj = await performTx("documents", "readonly", (s) => s.get(docId));
    return docObj ? docObj.data : null;
  },

  async deleteDocument(token, docId, csrfToken = null) {
    await this.verifySession(token, csrfToken);
    await performTx("documents", "readwrite", (s) => s.delete(docId));
    return { success: true };
  }
};

// ponytail: prevent runtime auth bypass by freezing the MockServer object
Object.freeze(MockServer);

