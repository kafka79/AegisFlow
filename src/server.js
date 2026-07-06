import { sha256, hashPassword, generateSalt, generateHmacKey, signSessionToken, verifySessionToken } from "./crypto.js";

/**
 * Mock Backend Server Module
 * Runs in a secure closure representing an isolated remote backend service.
 * Connects to its own private database namespace (IndexedDB: workforces_server_db).
 */

const DB_NAME = "workforces_server_db";
const DB_VERSION = 1;
let db = null;
let hmacKey = null;

// Initialize Server Database
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

// Generate or retrieve the non-extractable session key from config store
async function loadHmacKey() {
  const transaction = db.transaction("config", "readonly");
  const store = transaction.objectStore("config");
  return new Promise((resolve) => {
    const request = store.get("hmac_key");
    request.onsuccess = async () => {
      if (request.result) {
        hmacKey = request.result.value;
      } else {
        hmacKey = await generateHmacKey();
        const writeTx = db.transaction("config", "readwrite");
        writeTx.objectStore("config").put({ key: "hmac_key", value: hmacKey });
      }
      resolve();
    };
    request.onerror = () => resolve();
  });
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
    await loadHmacKey();
    
    // Seed initial admin account if server db is empty
    const users = await getStoreAll("users");
    if (users.length === 0) {
      const salt = generateSalt();
      const adminPassHash = await hashPassword(await sha256("admin123"), salt);
      
      const adminUser = {
        employeeId: "ODIAD20260001",
        email: "admin@odoo.com",
        password: adminPassHash,
        salt: salt,
        role: "HR"
      };
      
      const adminEmp = {
        id: "ODIAD20260001",
        name: "HR Admin",
        email: "admin@odoo.com",
        phone: "+91 98765 43210",
        role: "HR",
        department: "Human Resources",
        manager: "N/A",
        location: "Headquarters, India",
        dateOfJoining: "2026-01-01",
        dob: "1990-05-15",
        address: "123 Odoo Avenue, Tech Park, Mumbai",
        nationality: "Indian",
        gender: "Female",
        maritalStatus: "Single",
        status: "Present",
        wage: 150000,
        bankName: "State Bank of India",
        accountNo: "12345678901",
        ifsc: "SBIN0001234",
        pan: "ABCDE1234F",
        ptoDays: 30,
        sickDays: 15,
        avatar: ""
      };
      
      const tx = db.transaction(["users", "employees"], "readwrite");
      tx.objectStore("users").put(adminUser);
      tx.objectStore("employees").put(adminEmp);
      console.log("[SERVER] Seeded default secure admin account.");
    }
  },

  // Authenticate user & return signed session token
  async authenticate(loginVal, password) {
    const users = await getStoreAll("users");
    const user = users.find(u => 
      u.email.toLowerCase() === loginVal.toLowerCase() || 
      u.employeeId.toLowerCase() === loginVal.toLowerCase()
    );
    
    if (!user) throw new Error("Invalid username or password.");
    
    const inputHash = await sha256(password);
    const stretched = await hashPassword(inputHash, user.salt);
    
    if (user.password !== stretched) {
      throw new Error("Invalid username or password.");
    }
    
    // Generate session token valid for 2 hours
    const expiresAt = Date.now() + 2 * 60 * 60 * 1000;
    const sessionPayload = {
      employeeId: user.employeeId,
      role: user.role,
      expiresAt: expiresAt
    };
    
    const signedToken = await signSessionToken(sessionPayload, hmacKey);
    const employee = await performTx("employees", "readonly", (store) => store.get(user.employeeId));
    
    return { token: signedToken, employee };
  },

  // Verify signed token and return valid details or throw
  async verifySession(token) {
    if (!token) return null;
    const payload = await verifySessionToken(token, hmacKey);
    if (!payload) throw new Error("Session signature verification failed.");
    
    if (payload.expiresAt < Date.now()) {
      throw new Error("Session has expired.");
    }
    return payload;
  },

  // Handle registrations securely (hashes password before server DB write)
  async registerUser(employeeDetails, password, token = null) {
    const email = employeeDetails.email.toLowerCase().trim();
    const users = await getStoreAll("users");
    
    // Check if the user is attempting a credentials/password update
    const existingUser = users.find(u => u.employeeId === employeeDetails.id);
    if (existingUser) {
      if (!token) {
        throw new Error("Authentication required to update user security credentials.");
      }
      const session = await this.verifySession(token);
      if (session.employeeId !== employeeDetails.id && session.role !== "HR") {
        throw new Error("Unauthorized to update this user's password.");
      }
      
      const salt = generateSalt();
      const stretched = await hashPassword(await sha256(password), salt);
      existingUser.password = stretched;
      existingUser.salt = salt;
      
      const tx = db.transaction("users", "readwrite");
      tx.objectStore("users").put(existingUser);
      return { token, employee: employeeDetails };
    }
    
    // New registration rules (RBAC / Auth checks)
    if (users.length > 0) {
      // If registering as HR, must have a valid HR session token
      if (employeeDetails.role === "HR") {
        if (!token) {
          throw new Error("Authorization token is required to register an HR account.");
        }
        const session = await this.verifySession(token);
        if (session.role !== "HR") {
          throw new Error("Only HR personnel can register new HR accounts.");
        }
      }
    }
    
    if (users.some(u => u.email.toLowerCase() === email)) {
      throw new Error("A user with this Email already exists.");
    }
    
    const salt = generateSalt();
    const stretched = await hashPassword(await sha256(password), salt);
    
    const newUser = {
      employeeId: employeeDetails.id,
      email: email,
      password: stretched,
      salt: salt,
      role: employeeDetails.role
    };
    
    const tx = db.transaction(["users", "employees"], "readwrite");
    tx.objectStore("users").put(newUser);
    tx.objectStore("employees").put(employeeDetails);
    
    const expiresAt = Date.now() + 2 * 60 * 60 * 1000;
    const signedToken = await signSessionToken({
      employeeId: employeeDetails.id,
      role: employeeDetails.role,
      expiresAt: expiresAt
    }, hmacKey);
    
    return { token: signedToken, employee: employeeDetails };
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
  async syncTransactions(token, transactions) {
    await this.verifySession(token);
    
    const tx = db.transaction(["employees", "attendance", "timeoff", "users"], "readwrite");
    const stores = {
      employees: tx.objectStore("employees"),
      attendance: tx.objectStore("attendance"),
      timeoff: tx.objectStore("timeoff"),
      users: tx.objectStore("users")
    };
    
    let conflicts = 0;
    
    for (const trx of transactions) {
      const { type, store, data, timestamp } = trx;
      
      if (!stores[store]) continue;
      
      if (type === "PUT" || type === "ADD" || type === "UPDATE") {
        const existing = await new Promise((resolve) => {
          const req = stores[store].get(data.id);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        });
        
        if (!existing || !existing.lastModified || existing.lastModified < timestamp) {
          data.lastModified = timestamp;
          stores[store].put(data);
        } else {
          conflicts++;
          console.warn(`[SERVER] Conflict detected in ${store} for ID ${data.id}. Server record is newer. Write dropped.`);
        }
      } else if (type === "DELETE") {
        const existing = await new Promise((resolve) => {
          const req = stores[store].get(data.id);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        });
        
        if (!existing) {
          // Already deleted
        } else if (!existing.lastModified || existing.lastModified < timestamp) {
          stores[store].delete(data.id);
          if (store === "employees") {
            stores.users.delete(data.id);
          }
        } else {
          conflicts++;
          console.warn(`[SERVER] Conflict detected on delete in ${store} for ID ${data.id}. Server record is newer. Delete dropped.`);
        }
      }
    }
    
    return { success: true, conflicts, timestamp: Date.now() };
  },

  // Direct File/Document handlers
  async saveDocument(token, docId, docBlob) {
    await this.verifySession(token);
    await performTx("documents", "readwrite", (s) => s.put({ id: docId, data: docBlob }));
    return { success: true };
  },

  async getDocument(token, docId) {
    await this.verifySession(token);
    const docObj = await performTx("documents", "readonly", (s) => s.get(docId));
    return docObj ? docObj.data : null;
  },

  async deleteDocument(token, docId) {
    await this.verifySession(token);
    await performTx("documents", "readwrite", (s) => s.delete(docId));
    return { success: true };
  }
};
