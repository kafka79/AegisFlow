import { MockServer } from "./server.js";
import { addFieldClocks } from "./merge.js";

/**
 * Offline Sync Engine Module
 * Manages local mutation queue (IndexedDB) and syncs transaction logs to the in-browser mock server.
 * Implements retry/backoff, per-field vector-clock merge, and cross-tab BroadcastChannel coordination.
 */

const SYNC_DB_NAME = "workforces_sync_db";
const SYNC_DB_VERSION = 4;
const SYNC_PROTOCOL_VERSION = 2;
const MAX_RETRIES = 5;
const RETRY_BASE_DELAY_MS = 5000;
const SYNC_BATCH_SIZE = 50;
const VECTOR_CLOCK_TTL_DAYS = 30;
const CONNECTIVITY_CHECK_INTERVAL_MS = 30000;
const CONNECTIVITY_CHECK_URL = "/favicon.ico";
const MAX_BUFFERED_AMOUNT = 1024 * 1024;
const MESSAGE_TIMEOUT_MS = 30000;
const TELEMETRY_ENDPOINT = (() => {
  try {
    const url = new URL(window.location.href);
    return url.searchParams.get("telemetry_endpoint") || "/api/telemetry";
  } catch {
    return "/api/telemetry";
  }
})();

let syncDb = null;
const syncStatusListeners = [];
let currentSyncCursor = 0;
let syncChannel = null;
let connectivityCheckTimer = null;
let isOnlineCache = true;
let lastConnectivityCheck = 0;
const pendingAcks = new Map();
let messageSequence = 0;

function getClientId() {
  let clientId = localStorage.getItem("sync_client_id");
  if (!clientId) {
    clientId = "client_" + crypto.randomUUID();
    localStorage.setItem("sync_client_id", clientId);
  }
  return clientId;
}

function generateVectorClock() {
  const clientId = getClientId();
  const rawValue = localStorage.getItem("vector_clock_" + clientId);
  let clockData;
  try {
    clockData = rawValue ? JSON.parse(rawValue) : null;
  } catch {
    clockData = null;
  }
  
  if (!clockData || clockData.clock === undefined) {
    clockData = {
      clock: clockData || {},
      lastUpdated: Date.now()
    };
  }
  
  clockData.clock[clientId] = (clockData.clock[clientId] || 0) + 1;
  clockData.lastUpdated = Date.now();
  
  localStorage.setItem("vector_clock_" + clientId, JSON.stringify(clockData));
  return clockData.clock;
}

async function acquireSyncLock() {
  if (!syncDb) return false;
  return new Promise((resolve) => {
    const tx = syncDb.transaction("sync_meta", "readwrite");
    const store = tx.objectStore("sync_meta");
    const getReq = store.get("sync_lock");
    getReq.onsuccess = () => {
      const existing = getReq.result;
      const now = Date.now();
      const currentClient = getClientId();
      
      if (existing) {
        const age = now - existing.value;
        if (age < 30000 && existing.owner !== currentClient) {
          resolve(false);
          return;
        }
      }
      
      const putReq = store.put({ key: "sync_lock", value: now, owner: currentClient });
      putReq.onsuccess = () => resolve(true);
      putReq.onerror = () => resolve(false);
    };
    getReq.onerror = () => resolve(false);
  });
}

async function releaseSyncLock() {
  if (!syncDb) return;
  return new Promise((resolve) => {
    const tx = syncDb.transaction("sync_meta", "readwrite");
    const store = tx.objectStore("sync_meta");
    const getReq = store.get("sync_lock");
    getReq.onsuccess = () => {
      const existing = getReq.result;
      if (existing && existing.owner === getClientId()) {
        store.delete("sync_lock");
      }
      resolve();
    };
    getReq.onerror = () => resolve();
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

async function isSyncLockHeld() {
  if (!syncDb) return false;
  return new Promise((resolve) => {
    const tx = syncDb.transaction("sync_meta", "readonly");
    const store = tx.objectStore("sync_meta");
    const request = store.get("sync_lock");
    request.onsuccess = () => {
      const existing = request.result;
      if (existing) {
        const age = Date.now() - existing.value;
        if (age < 30000) {
          resolve(true);
          return;
        }
      }
      resolve(false);
    };
    request.onerror = () => resolve(false);
  });
}

async function loadSyncCursor() {
  if (!syncDb) return 0;
  return new Promise((resolve) => {
    const tx = syncDb.transaction("sync_meta", "readonly");
    const store = tx.objectStore("sync_meta");
    const request = store.get("cursor");
    request.onsuccess = () => resolve(request.result?.value || 0);
    request.onerror = () => resolve(0);
  });
}

async function saveSyncCursor(cursor) {
  if (!syncDb) return;
  return new Promise((resolve, reject) => {
    const tx = syncDb.transaction("sync_meta", "readwrite");
    const store = tx.objectStore("sync_meta");
    store.put({ key: "cursor", value: cursor });
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

class BroadcastChannelFallback {
  constructor(channelName) {
    this.channelName = channelName;
    this.onmessage = null;
    this._listener = (e) => {
      if (e.key === "bc_" + this.channelName && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          if (data.senderId !== this._senderId) {
            this.onmessage?.({ data: data.message });
          }
        } catch {}
      }
    };
    this._senderId = Math.random().toString(36).substring(2);
    window.addEventListener("storage", this._listener);
  }
  postMessage(message) {
    const payload = JSON.stringify({ senderId: this._senderId, message, timestamp: Date.now() });
    localStorage.setItem("bc_" + this.channelName, payload);
    localStorage.removeItem("bc_" + this.channelName);
  }
  close() {
    window.removeEventListener("storage", this._listener);
  }
}

function broadcastSyncTrigger() {
  syncChannel?.postMessage({ type: "sync_trigger" });
}

function broadcastSyncComplete(cursor) {
  syncChannel?.postMessage({ type: "sync_complete", cursor });
}

function setupBroadcastChannel() {
  try {
    if (typeof BroadcastChannel !== "undefined") {
      syncChannel = new BroadcastChannel("workforces_sync");
    } else {
      syncChannel = new BroadcastChannelFallback("workforces_sync");
    }
    syncChannel.onmessage = (e) => {
      if (e.data.type === "sync_trigger" && isOnlineCache) {
        SyncEngine.sync();
      } else if (e.data.type === "sync_complete") {
        currentSyncCursor = Math.max(currentSyncCursor, e.data.cursor || 0);
        saveSyncCursor(currentSyncCursor);
      }
    };
  } catch (e) {
    console.warn("[SYNC] BroadcastChannel setup failed, falling back:", e);
    try {
      syncChannel = new BroadcastChannelFallback("workforces_sync");
      syncChannel.onmessage = (e) => {
        if (e.data.type === "sync_trigger" && isOnlineCache) {
          SyncEngine.sync();
        } else if (e.data.type === "sync_complete") {
          currentSyncCursor = Math.max(currentSyncCursor, e.data.cursor || 0);
          saveSyncCursor(currentSyncCursor);
        }
      };
    } catch (err) {
      console.error("[SYNC] Polyfill setup failed:", err);
    }
  }
}

async function checkConnectivity() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    if (isOnlineCache) {
      isOnlineCache = false;
      SyncEngine.getQueueLength().then(len => notifyStatus("offline", len));
    }
    return false;
  }
  const now = Date.now();
  if (now - lastConnectivityCheck < CONNECTIVITY_CHECK_INTERVAL_MS) {
    return isOnlineCache;
  }
  lastConnectivityCheck = now;
  
  const wasOnline = isOnlineCache;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    await fetch(CONNECTIVITY_CHECK_URL, { 
      method: "HEAD", 
      cache: "no-cache", 
      signal: controller.signal 
    });
    clearTimeout(timeoutId);
    isOnlineCache = true;
  } catch {
    isOnlineCache = false;
  }
  
  if (wasOnline !== isOnlineCache) {
    SyncEngine.getQueueLength().then(len => {
      notifyStatus(isOnlineCache ? "online" : "offline", len);
      if (isOnlineCache) {
        broadcastSyncTrigger();
        SyncEngine.sync();
      }
    });
  }
  
  return isOnlineCache;
}

function startConnectivityMonitor() {
  if (connectivityCheckTimer) clearInterval(connectivityCheckTimer);
  connectivityCheckTimer = setInterval(() => {
    checkConnectivity();
  }, CONNECTIVITY_CHECK_INTERVAL_MS);
  connectivityCheckTimer.unref?.();
  checkConnectivity();
}

function stopConnectivityMonitor() {
  if (connectivityCheckTimer) clearInterval(connectivityCheckTimer);
}

function notifyStatus(status, queueLength = 0) {
  syncStatusListeners.forEach(listener => {
    try {
      listener(status, queueLength);
    } catch (e) {
      console.error("[SYNC] Listener error:", e);
    }
  });
}

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
      if (!activeDb.objectStoreNames.contains("retry_queue")) {
        const retryStore = activeDb.createObjectStore("retry_queue", { keyPath: "id", autoIncrement: true });
        retryStore.createIndex("nextRetryAt", "nextRetryAt", { unique: false });
      }
      if (!activeDb.objectStoreNames.contains("sync_meta")) {
        activeDb.createObjectStore("sync_meta", { keyPath: "key" });
      }
      if (!activeDb.objectStoreNames.contains("ack_queue")) {
        activeDb.createObjectStore("ack_queue", { keyPath: "sequence" });
      }
      if (!activeDb.objectStoreNames.contains("server_state")) {
        activeDb.createObjectStore("server_state", { keyPath: "store" });
      }
    };
  });
}

async function sendWithAck(ws, message, timeout = MESSAGE_TIMEOUT_MS) {
  const sequence = ++messageSequence;
  const payload = { ...message, sequence, protocolVersion: SYNC_PROTOCOL_VERSION, timestamp: Date.now() };

  if (ws.bufferedAmount > MAX_BUFFERED_AMOUNT) {
    await new Promise(r => setTimeout(r, 100));
  }

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pendingAcks.delete(sequence);
      reject(new Error(`Message ${sequence} timed out after ${timeout}ms`));
    }, timeout);

    pendingAcks.set(sequence, { resolve, reject, timeoutId });
    ws.send(JSON.stringify(payload));
  });
}

async function ensureWsConnection() {
  return false;
}

async function sendBatchWithAck(batch, token, csrfToken) {
  return MockServer.syncTransactions(token, batch, csrfToken);
}

function handleAck(sequence, success, error) {
  const pending = pendingAcks.get(sequence);
  if (pending) {
    clearTimeout(pending.timeoutId);
    pendingAcks.delete(sequence);
    if (success) {
      pending.resolve();
    } else {
      pending.reject(new Error(error || "Message rejected by server"));
    }
  }
}

async function negotiateProtocolVersion(ws) {
  return new Promise((resolve) => {
    const handler = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "protocol_version") {
          ws.removeEventListener("message", handler);
          resolve(Math.min(msg.version, SYNC_PROTOCOL_VERSION));
        }
      } catch {}
    };
    ws.addEventListener("message", handler);
    ws.send(JSON.stringify({ type: "protocol_version", version: SYNC_PROTOCOL_VERSION }));
    setTimeout(() => { ws.removeEventListener("message", handler); resolve(1); }, 5000);
  });
}

function persistServerState(store, data) {
  if (!syncDb) return Promise.resolve();
  return new Promise((resolve) => {
    const tx = syncDb.transaction("server_state", "readwrite");
    const storeObj = tx.objectStore("server_state");
    storeObj.put({ store, data, updatedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

async function loadServerState(store) {
  if (!syncDb) return null;
  return new Promise((resolve) => {
    const tx = syncDb.transaction("server_state", "readonly");
    const storeObj = tx.objectStore("server_state");
    const request = storeObj.get(store);
    request.onsuccess = () => resolve(request.result?.data || null);
    request.onerror = () => resolve(null);
  });
}

function cleanupVectorClocks() {
  const clientId = getClientId();
  const cutoff = Date.now() - (VECTOR_CLOCK_TTL_DAYS * 24 * 60 * 60 * 1000);
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith("vector_clock_") && key !== `vector_clock_${clientId}`) {
      try {
        const stored = JSON.parse(localStorage.getItem(key) || "{}");
        const lastUpdated = stored.lastUpdated || 0;
        if (lastUpdated < cutoff) {
          localStorage.removeItem(key);
        }
      } catch {
        localStorage.removeItem(key);
      }
    }
  }
}

async function getActiveSession() {
  try {
    await window.store?.ready;
  } catch {}

  const liveSession = window.store?.state?.currentSession;
  if (liveSession?.token) {
    return {
      token: liveSession.token,
      csrfToken: liveSession.csrfToken || null
    };
  }

  const stateStr = localStorage.getItem("workforces_state");
  if (!stateStr) return { token: null, csrfToken: null };

  try {
    const state = JSON.parse(stateStr);
    return {
      token: state.currentSession?.token || null,
      csrfToken: state.currentSession?.csrfToken || null
    };
  } catch (e) {
    console.error("[SYNC] Could not parse session token/CSRF:", e);
    return { token: null, csrfToken: null };
  }
}

window.SyncTelemetry = {
  successCount: 0,
  failureCount: 0,
  conflictCount: 0,
  recentLogs: [],
  log(message) {
    this.recentLogs.unshift({ timestamp: Date.now(), message });
    if (this.recentLogs.length > 30) this.recentLogs.pop();
    
    // Log structured JSON to the console
    console.log(JSON.stringify({
      level: "info",
      timestamp: new Date().toISOString(),
      message: message,
      successCount: this.successCount,
      failureCount: this.failureCount,
      conflictCount: this.conflictCount
    }));
    
    if (window.location.protocol !== "file:") {
      try {
        const sanitizedMsg = String(message || "")
          .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL]")
          .replace(/ODI[A-Z0-9]+/gi, "[ID]");
        const payload = JSON.stringify({
          timestamp: Date.now(),
          message: sanitizedMsg,
          successCount: this.successCount,
          failureCount: this.failureCount,
          conflictCount: this.conflictCount
        });
        const blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon(TELEMETRY_ENDPOINT, blob);
      } catch (e) { /* ignore */ }
    }
    if (typeof window.renderDevConsole === "function") {
      try { window.renderDevConsole(); } catch (e) { console.error("Telemetry render error:", e); }
    }
  }
};

export const SyncEngine = {
  async init() {
    await initSyncDB();
    await loadSyncCursor().then(c => { currentSyncCursor = c; });
    setupBroadcastChannel();
    startConnectivityMonitor();
    cleanupVectorClocks();
    const cleanupTimer = setInterval(cleanupVectorClocks, 24 * 60 * 60 * 1000);
    cleanupTimer.unref?.();
    
    this.sync();
    
    window.addEventListener("online", () => {
      console.log("[SYNC] Network online. Flushing queue...");
      checkConnectivity().then(online => {
        if (online) {
          broadcastSyncTrigger();
          this.sync();
        }
      });
    });
    
    window.addEventListener("offline", () => {
      console.log("[SYNC] Network offline. Queueing mutations...");
      checkConnectivity().then(online => {
        isOnlineCache = online;
        this.getQueueLength().then(len => notifyStatus(online ? "online" : "offline", len));
      });
    });
    
    let syncIntervalMs = 15000;
    let syncTimeout = null;
    
    const runBackgroundSync = () => {
      if (syncTimeout) clearTimeout(syncTimeout);
      syncTimeout = setTimeout(() => {
        checkConnectivity().then(online => {
          isSyncLockHeld().then((held) => {
            if (online && !held) {
              this.sync().then((success) => {
                if (success) syncIntervalMs = 15000;
                else syncIntervalMs = Math.min(syncIntervalMs * 2, 300000);
                runBackgroundSync();
              });
            } else {
              runBackgroundSync();
            }
          });
        });
      }, syncIntervalMs);
      syncTimeout.unref?.();
    };
    
    let retryTimeout = null;
    const processRetryQueue = async () => {
      if (retryTimeout) clearTimeout(retryTimeout);
      const now = Date.now();
      const dueRetries = [];
      
      if (syncDb) {
        await new Promise((resolve) => {
          const tx = syncDb.transaction("retry_queue", "readonly");
          const store = tx.objectStore("retry_queue");
          const index = store.index("nextRetryAt");
          const range = IDBKeyRange.upperBound(now);
          const request = index.openCursor(range);
          
          let count = 0;
          request.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor && count < SYNC_BATCH_SIZE) {
              dueRetries.push(cursor.value);
              count++;
              cursor.continue();
            } else {
              resolve();
            }
          };
          request.onerror = () => resolve();
        });
      }
      
      for (const item of dueRetries) {
        await this.enqueue(item.type, item.store, item.data, item.priority);
        await this.removeFromRetryQueue(item.id);
      }
      
      retryTimeout = setTimeout(processRetryQueue, 5000);
      retryTimeout.unref?.();
    };
    
    runBackgroundSync();
    processRetryQueue();
  },
  
  onStatusChange(listener) {
    syncStatusListeners.push(listener);
    checkConnectivity().then(online => {
      this.getQueueLength().then(len => listener(online ? "online" : "offline", len));
    });
  },
  
  async enqueue(type, storeName, data, priority = 0) {
    if (!syncDb) return;
    
    const vectorClock = generateVectorClock();
    const mutation = {
      type,
      store: storeName,
      data: addFieldClocks({ ...data }, vectorClock, getClientId()),
      timestamp: Date.now(),
      priority,
      vectorClock,
      protocolVersion: SYNC_PROTOCOL_VERSION,
      retryCount: 0
    };
    
    return new Promise((resolve, reject) => {
      const tx = syncDb.transaction("queue", "readwrite");
      const store = tx.objectStore("queue");
      store.add(mutation);
      tx.oncomplete = () => {
        this.getQueueLength().then(len => {
          notifyStatus(isOnlineCache ? "online" : "offline", len);
          if (isOnlineCache) broadcastSyncTrigger();
        });
        resolve();
      };
      tx.onerror = (e) => {
        console.error("[SYNC] Write failed:", e.target.error);
        if (e.target.error?.name === "QuotaExceededError") {
          window.showToast?.("Storage full. Clear space to continue.", "error");
        }
        reject(e.target.error);
      };
    });
  },
  
  async getPendingTransactions(offset = 0, limit = SYNC_BATCH_SIZE) {
    let actualOffset = 0;
    let actualLimit = SYNC_BATCH_SIZE;
    if (arguments.length === 1) {
      actualLimit = arguments[0];
    } else if (arguments.length >= 2) {
      actualOffset = arguments[0];
      actualLimit = arguments[1];
    }
    
    if (!syncDb) return [];
    return new Promise((resolve) => {
      const tx = syncDb.transaction("queue", "readonly");
      const store = tx.objectStore("queue");
      const request = store.getAll();
      request.onsuccess = () => {
        const all = request.result || [];
        all.sort((a, b) => (b.priority || 0) - (a.priority || 0) || a.timestamp - b.timestamp);
        const pending = all.slice(actualOffset, actualOffset + actualLimit);
        resolve(pending);
      };
      request.onerror = () => resolve([]);
    });
  },
  
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
  
  async clearQueueIds(ids) {
    if (!syncDb || !ids || ids.length === 0) return;
    return new Promise((resolve, reject) => {
      const tx = syncDb.transaction("queue", "readwrite");
      const store = tx.objectStore("queue");
      for (const id of ids) store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  },
  
  async addToRetryQueue(mutation, error) {
    if (!syncDb) return;
    const retryCount = (mutation.retryCount || 0) + 1;
    if (retryCount > MAX_RETRIES) {
      window.SyncTelemetry.log(`Mutation ${mutation.id} exceeded max retries, moving to dead letter`);
      return;
    }
    
    const delay = RETRY_BASE_DELAY_MS * Math.pow(2, retryCount - 1);
    const nextRetryAt = Date.now() + delay;
    
    return new Promise((resolve, reject) => {
      const tx = syncDb.transaction("retry_queue", "readwrite");
      const store = tx.objectStore("retry_queue");
      store.put({ ...mutation, retryCount, nextRetryAt, lastError: error?.message || String(error) });
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  },
  
  async removeFromRetryQueue(id) {
    if (!syncDb) return;
    return new Promise((resolve, reject) => {
      const tx = syncDb.transaction("retry_queue", "readwrite");
      const store = tx.objectStore("retry_queue");
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  },
  
  async sync() {
    const online = await checkConnectivity();
    if (await isSyncLockHeld() || !online) return false;
    
    const { token, csrfToken } = await getActiveSession();
    
    if (!token) {
      window.SyncTelemetry.log("Sync abort: No active authenticated session token found.");
      this.getQueueLength().then(len => notifyStatus("offline", len));
      return false;
    }
    
    const lockAcquired = await acquireSyncLock();
    if (!lockAcquired) return false;
    
    try {
      const pending = await this.getPendingTransactions();
      if (pending.length === 0) {
        notifyStatus("online", 0);
        return true;
      }
      
      notifyStatus("syncing", pending.length);
      window.SyncTelemetry.log(`Sync initiated. Processing ${pending.length} transactions...`);
      
      const wsReady = await ensureWsConnection();
      let syncResult;
      
      if (wsReady) {
        const batches = [];
        for (let i = 0; i < pending.length; i += SYNC_BATCH_SIZE) {
          batches.push(pending.slice(i, i + SYNC_BATCH_SIZE));
        }
        
        const allResults = [];
        let totalConflicts = 0;
        
        for (const batch of batches) {
          const result = await sendBatchWithAck(batch, token, csrfToken);
          allResults.push(...(result.results || []));
          totalConflicts += result.conflicts || 0;
        }
        
        syncResult = { success: true, results: allResults, conflicts: totalConflicts };
      } else {
        try {
          syncResult = await MockServer.syncTransactions(token, pending, csrfToken);
        } catch (err) {
          syncResult = {
            success: false,
            results: pending.map(m => ({ id: m.id, status: "error", error: err.message || String(err) })),
            conflicts: 0
          };
        }
      }
      
      const results = syncResult.results || [];
      const successful = [];
      const failed = [];
      const totalConflicts = syncResult.conflicts || 0;
      
      for (const res of results) {
        const m = pending.find(item => item.id === res.id);
        if (!m) continue;
        if (res.status === "success" || res.status === "conflict") {
          successful.push(m);
        } else {
          failed.push({ mutation: m, error: res.error });
        }
      }
      
      const processedIds = pending.map(m => m.id);
      if (processedIds.length > 0) {
        await this.clearQueueIds(processedIds);
        const maxId = Math.max(...processedIds);
        currentSyncCursor = Math.max(currentSyncCursor, maxId);
        await saveSyncCursor(currentSyncCursor);
        broadcastSyncComplete(currentSyncCursor);
      }
      
      window.SyncTelemetry.successCount += successful.length;
      window.SyncTelemetry.failureCount += failed.length;
      window.SyncTelemetry.conflictCount += totalConflicts;
      
      for (const f of failed) {
        await this.addToRetryQueue(f.mutation, f.error);
      }
      
      window.SyncTelemetry.log(`Sync complete. Success: ${successful.length}, Failed: ${failed.length}, Conflicts: ${totalConflicts}`);
      
      const remainingLen = await this.getQueueLength();
      notifyStatus(remainingLen > 0 ? "syncing" : "online", remainingLen);
      return failed.length === 0;
    } finally {
      await releaseSyncLock();
    }
  }
};
