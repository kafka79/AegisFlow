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
      const adminPassHash = await hashPassword(await sha256("Admin@1234"), salt);
      
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
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["users", "employees"], "readwrite");
      tx.objectStore("users").put(newUser);
      tx.objectStore("employees").put(employeeDetails);
      tx.oncomplete = async () => {
        const expiresAt = Date.now() + 2 * 60 * 60 * 1000;
        const signedToken = await signSessionToken({
          employeeId: employeeDetails.id,
          role: employeeDetails.role,
          expiresAt: expiresAt
        }, hmacKey);
        resolve({ token: signedToken, employee: employeeDetails });
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
  async syncTransactions(token, transactions) {
    const session = await this.verifySession(token);
    
    // ponytail: use server-side timestamp to prevent client clock drift
    const serverTimestamp = Date.now();
    let conflicts = 0;
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["employees", "attendance", "timeoff", "users"], "readwrite");
      const stores = {
        employees: tx.objectStore("employees"),
        attendance: tx.objectStore("attendance"),
        timeoff: tx.objectStore("timeoff"),
        users: tx.objectStore("users")
      };
      
      let index = 0;
      
      function processNext() {
        if (index >= transactions.length) {
          return;
        }
        
        const trx = transactions[index++];
        const { type, store, data } = trx;
        
        if (!stores[store]) {
          processNext();
          return;
        }
        
        // Key path resolution: 'users' uses employeeId, others use id
        const key = store === "users" ? data.employeeId : data.id;
        if (!key) {
          processNext();
          return;
        }
        
        const req = stores[store].get(key);
        req.onsuccess = () => {
          const existing = req.result;
          
          // Role-Based Access Control Checks
          if (session.role !== "HR") {
            if (store === "employees") {
              // Non-HR can only modify their own employee record
              if (key !== session.employeeId) {
                console.warn(`[SERVER] Auth Block: Non-HR user ${session.employeeId} attempted to modify employee ${key}`);
                processNext();
                return;
              }
              // Prevent non-HR from updating restricted fields
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
                // Non-HR cannot add new employee records
                processNext();
                return;
              }
            } else if (store === "users") {
              // Non-HR can only update their own credentials
              if (key !== session.employeeId) {
                console.warn(`[SERVER] Auth Block: Non-HR user ${session.employeeId} attempted to modify user credentials of ${key}`);
                processNext();
                return;
              }
              if (existing) {
                data.role = existing.role;
              } else {
                processNext();
                return;
              }
            } else if (store === "attendance") {
              // Non-HR can only check-in/out for themselves
              if (data.employeeId !== session.employeeId) {
                console.warn(`[SERVER] Auth Block: Non-HR user ${session.employeeId} attempted to modify attendance of ${data.employeeId}`);
                processNext();
                return;
              }
            } else if (store === "timeoff") {
              // Non-HR can only create/edit their own leave requests
              if (data.employeeId !== session.employeeId) {
                console.warn(`[SERVER] Auth Block: Non-HR user ${session.employeeId} attempted to modify timeoff request of ${data.employeeId}`);
                processNext();
                return;
              }
              // Prevent self-approval of leaves and editing of admin comment
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
              data.lastModified = serverTimestamp;
              const putReq = stores[store].put(data);
              putReq.onsuccess = () => {
                if (index >= transactions.length) {
                  // Final callback triggers resolve on transaction complete
                } else {
                  processNext();
                }
              };
              putReq.onerror = (e) => reject(e.target.error);
            } else {
              conflicts++;
              // ponytail: resolve merge conflict by merging non-overlapping fields, server wins on overlap
              const merged = { ...data, ...existing, lastModified: existing.lastModified || serverTimestamp };
              const putReq = stores[store].put(merged);
              putReq.onsuccess = () => processNext();
              putReq.onerror = (e) => reject(e.target.error);
            }
          } else if (type === "DELETE") {
            // Delete check
            if (session.role !== "HR") {
              // Non-HR cannot delete anything
              console.warn(`[SERVER] Auth Block: Non-HR user ${session.employeeId} attempted to delete a record in store ${store}`);
              processNext();
              return;
            }
            if (!existing) {
              processNext();
            } else if (!existing.lastModified || existing.lastModified < serverTimestamp) {
              const delReq = stores[store].delete(key);
              delReq.onsuccess = () => {
                if (store === "employees") {
                  stores.users.delete(key);
                }
                processNext();
              };
              delReq.onerror = (e) => reject(e.target.error);
            } else {
              conflicts++;
              processNext();
            }
          }
        };
        req.onerror = (e) => reject(e.target.error);
      }
      
      tx.oncomplete = () => {
        resolve({ success: true, conflicts, timestamp: serverTimestamp });
      };
      tx.onerror = (e) => reject(e.target.error);
      
      if (transactions.length === 0) {
        resolve({ success: true, conflicts: 0, timestamp: serverTimestamp });
      } else {
        processNext();
      }
    });
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

// ponytail: prevent runtime auth bypass by freezing the MockServer object
Object.freeze(MockServer);
