/**
 * Shared app singletons — prefer these over window.* in new code.
 */
/** @type {import('./store.js').Store|null} */
let storeRef = null;
/** @type {import('./router.js').Router|null} */
let routerRef = null;

/** @param {import('./store.js').Store} store */
export function registerStore(store) {
  storeRef = store;
}

export function getStore() {
  return storeRef;
}

/** @param {import('./router.js').Router} router */
export function registerRouter(router) {
  routerRef = router;
}

export function getRouter() {
  return routerRef;
}

export function installNavigationDelegation() {
  if (typeof document === "undefined" || document.body?.dataset?.wfNavReady) return;
  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-nav-route]");
    if (!target) return;
    event.preventDefault();
    const route = target.getAttribute("data-nav-route");
    const router = getRouter();
    if (!route || !router) return;
    const paramsRaw = target.getAttribute("data-nav-params");
    const params = paramsRaw ? JSON.parse(paramsRaw) : null;
    router.navigate(route, params);
  });
  if (document.body) document.body.dataset.wfNavReady = "true";
}

let telemetryEndpoint = "/api/telemetry";

export function setTelemetryEndpoint(url) {
  telemetryEndpoint = url;
}

export function getTelemetryEndpoint() {
  if (typeof window !== "undefined" && window.location) {
    try {
      const url = new URL(window.location.href);
      const override = url.searchParams.get("telemetry_endpoint");
      if (override) return override;
    } catch {}
  }
  return telemetryEndpoint;
}

export const SyncTelemetry = {
  successCount: 0,
  failureCount: 0,
  conflictCount: 0,
  recentLogs: [],
  log(message) {
    this.recentLogs.unshift({ timestamp: Date.now(), message });
    if (this.recentLogs.length > 30) this.recentLogs.pop();
    
    console.log(JSON.stringify({
      level: "info",
      timestamp: new Date().toISOString(),
      message: message,
      successCount: this.successCount,
      failureCount: this.failureCount,
      conflictCount: this.conflictCount
    }));
    
    if (typeof window !== "undefined" && window.location && window.location.protocol !== "file:") {
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
        if (typeof navigator !== "undefined" && navigator.sendBeacon) {
          navigator.sendBeacon(getTelemetryEndpoint(), blob);
        }
      } catch (e) { /* ignore */ }
    }
  }
};
