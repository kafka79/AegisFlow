import { MockServer } from "./server.js";

/**
 * Offline Sync Engine Module
 * Manages local mutation queue (IndexedDB) and syncs transaction logs to Mock Server.
 * Handles automatic retries and synchronization status tracking.
 */

// Initialize global telemetry tracking for development audit console
window.SyncTelemetry = {
  successCount: 0,
  failureCount: 0,
  conflictCount: 0,
  recentLogs: [],
  log(message) {
    this.recentLogs.unshift({
      timestamp: Date.now(),
      message
    });
    if (this.recentLogs.length > 30) {
      this.recentLogs.pop();
    }
    // ponytail: only send beacon in production environments to avoid console spam
    if (window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1" && window.location.protocol !== "file:") {
      try {
        // Redact PII (corporate emails and corporate employee IDs)
        const sanitizedMsg = String(message || "")
          .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL]")
          .replace(/ODI[A-Z0-9]+/gi, "[ID]");
          
        const payload = JSON.stringify({ timestamp: Date.now(), message: sanitizedMsg });
        const blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon("/api/telemetry", blob);
      } catch (e) {
        // ignore beacon errors
      }
    }
    if (typeof window.renderDevConsole === "function") {
      try {
        window.renderDevConsole();
      } catch (e) {
        console.error("Telemetry render error:", e);
      }
    }
  }
};

const SYNC_DB_NAME = "workforces_sync_db";
const SYNC_DB_VERSION = 1;
let syncDb = null;
let isSyncing = false;
const syncStatusListeners = [];

// Initialize Local Sync Queue DB
function initSyncDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SYNC_DB_NAME, SYNC_DB_VERSION);
    request.onerror = (e) => reject(e.target.error);
    request.onsuccess = (e) => {
      syncDb = e.target.result;
      resolve(syncDb);
    };
    request.onupgradeneeded = (e) => {
      const activeDb = e.target.result;
      if (!activeDb.objectStoreNames.contains("queue")) {
        activeDb.createObjectStore("queue", { keyPath: "id", autoIncrement: true });
      }
    };
  });
}

// Get network state
function isOnline() {
  return navigator.onLine;
}

// Trigger status updates to visual listeners
function notifyStatus(status, queueLength = 0) {
  syncStatusListeners.forEach(listener => {
    try {
      listener(status, queueLength);
    } catch (e) {
      console.error("[SYNC] Listener error:", e);
    }
  });
}

export const SyncEngine = {
  async init() {
    await initSyncDB();
    
    // Attempt sync immediately on startup
    this.sync();
    
    // Bind network status events
    window.addEventListener("online", () => {
      console.log("[SYNC] Network online. Flushing queue...");
      this.sync();
    });
    
    window.addEventListener("offline", () => {
      console.log("[SYNC] Network offline. Queueing mutations...");
      this.getQueueLength().then(len => notifyStatus("offline", len));
    });
    
    // Background retry loop with exponential backoff on failure
    let syncIntervalMs = 15000;
    let syncTimeout = null;
    
    const runBackgroundSync = () => {
      if (syncTimeout) clearTimeout(syncTimeout);
      syncTimeout = setTimeout(() => {
        if (isOnline() && !isSyncing) {
          this.sync().then((success) => {
            if (success) {
              syncIntervalMs = 15000; // Reset backoff on success
            } else {
              syncIntervalMs = Math.min(syncIntervalMs * 2, 300000); // Backoff up to 5 min
            }
            runBackgroundSync();
          });
        } else {
          runBackgroundSync();
        }
      }, syncIntervalMs);
    };
    
    runBackgroundSync();
  },

  // Listen to changes in synchronization status
  onStatusChange(listener) {
    syncStatusListeners.push(listener);
    // Initial notification
    this.getQueueLength().then(len => {
      listener(isOnline() ? "online" : "offline", len);
    });
  },

  // Add mutation transaction to sync queue
  async enqueue(type, storeName, data) {
    if (!syncDb) return;
    
    const transaction = syncDb.transaction("queue", "readwrite");
    const store = transaction.objectStore("queue");
    
    const mutation = {
      type, // PUT, DELETE
      store: storeName, // employees, attendance, timeoff
      data,
      timestamp: Date.now()
    };
    
    return new Promise((resolve, reject) => {
      store.add(mutation);
      transaction.oncomplete = () => {
        this.getQueueLength().then(len => {
          notifyStatus(isOnline() ? "online" : "offline", len);
          // Try synchronization immediately if online
          if (isOnline()) this.sync();
        });
        resolve();
      };
      transaction.onerror = (e) => {
        console.error("[SYNC] Write failed:", e.target.error);
        if (e.target.error && e.target.error.name === "QuotaExceededError") {
          window.showToast?.("Storage full. Clear space to continue.", "error");
        }
        reject(e.target.error);
      };
    });
  },

  // Fetch pending queue transactions
  async getPendingTransactions() {
    if (!syncDb) return [];
    return new Promise((resolve) => {
      const tx = syncDb.transaction("queue", "readonly");
      const store = tx.objectStore("queue");
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });
  },

  // Count pending transactions
  getQueueLength() {
    if (!syncDb) return Promise.resolve(0);
    return new Promise((resolve) => {
      const tx = syncDb.transaction("queue", "readonly");
      const store = tx.objectStore("queue");
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(0);
    });
  },

  // Clear specific successfully synchronized mutations from queue
  async clearQueueIds(ids) {
    if (!syncDb || !ids || ids.length === 0) return;
    return new Promise((resolve, reject) => {
      const tx = syncDb.transaction("queue", "readwrite");
      const store = tx.objectStore("queue");
      for (const id of ids) {
        store.delete(id);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  },

  // Flush local transaction logs to backend server
  async sync() {
    if (isSyncing || !isOnline()) return false;
    
    const pending = await this.getPendingTransactions();
    if (pending.length === 0) {
      notifyStatus("online", 0);
      return true;
    }
    
    isSyncing = true;
    notifyStatus("syncing", pending.length);
    window.SyncTelemetry.log(`Sync initiated. Processing ${pending.length} transactions...`);
    
    // Obtain session token from local storage state representation
    const stateStr = localStorage.getItem("workforces_state");
    let token = null;
    if (stateStr) {
      try {
        const state = JSON.parse(stateStr);
        token = state.currentSession ? state.currentSession.token : null;
      } catch (e) {
        console.error("[SYNC] Could not parse session token:", e);
      }
    }
    
    if (!token) {
      isSyncing = false;
      window.SyncTelemetry.log("Sync abort: No active authenticated session token found.");
      this.getQueueLength().then(len => notifyStatus("offline", len));
      return false;
    }
    
    try {
      // Synchronize with server using the verified token
      const result = await MockServer.syncTransactions(token, pending);
      
      // Update telemetry state
      window.SyncTelemetry.successCount += pending.length;
      if (result && result.conflicts) {
        window.SyncTelemetry.conflictCount += result.conflicts;
      }
      
      // On success, clear only the items that were synchronized
      const processedIds = pending.map(p => p.id);
      await this.clearQueueIds(processedIds);
      
      window.SyncTelemetry.log(`Successfully synced ${pending.length} transactions. Conflicts: ${result.conflicts || 0}`);
      console.log(`[SYNC] Successfully synchronized ${pending.length} transactions to cloud database.`);
      
      notifyStatus("online", 0);
      return true;
    } catch (err) {
      window.SyncTelemetry.failureCount++;
      window.SyncTelemetry.log(`Sync failure: ${err.message || err}`);
      console.error("[SYNC] Synchronization error:", err);
      // Wait for next timer cycle or status change
      this.getQueueLength().then(len => notifyStatus("offline", len));
      return false;
    } finally {
      isSyncing = false;
    }
  }
};
