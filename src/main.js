import { getRouter, registerRouter, installNavigationDelegation, registerStore } from "./app-context.js";
import { Router } from "./router.js";
import { Store } from "./store.js";
import { MockServer } from "./server.js";
import { MockEmailService } from "./email.js";
import { SyncEngine } from "./sync.js";
import { initDOMRenderer } from "./renderer.js";

function updateSyncBadgeUI(status, count) {
  const indicator = document.getElementById("sync-status-indicator");
  if (!indicator) return;
  
  if (status === "offline") {
    indicator.style.display = "flex";
    indicator.innerHTML = `<span class="sync-status-text">Offline (${count} pending)</span>`;
  } else if (status === "syncing") {
    indicator.style.display = "flex";
    indicator.innerHTML = `<span class="sync-spinner"></span><span class="sync-status-text">Syncing...</span>`;
  } else if (status === "online") {
    if (count > 0) {
      indicator.style.display = "flex";
      indicator.innerHTML = `<span class="sync-status-text">Pending: ${count}</span>`;
    } else {
      indicator.style.display = "none";
    }
  }
}

// Bootstrap Store
const store = new Store();
registerStore(store);

// Bootstrap Router
const router = new Router();
registerRouter(router);

installNavigationDelegation();
initDOMRenderer();

// Initialize backend and engines
MockServer.init().then(() => {
  MockEmailService.init();
  SyncEngine.init();
  
  // Bind Sync Engine state notifications to the header sync badge UI
  SyncEngine.onStatusChange((status, count) => {
    updateSyncBadgeUI(status, count);
  });
  
  // Initial route
  const currentView = store.state.currentSession ? "dashboard" : "login";
  router.navigate(currentView, null, { replace: true });
}).catch(err => {
  console.error("[BOOTSTRAP] Secure server initialization failed:", err);
});
