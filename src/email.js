/**
 * Mock Email & Developer Telemetry Console Module
 * Provides a floating unified developer panel in the bottom right corner of the screen.
 * Resolves the "Simulated SMTP" security flaw and provides real-time transaction sync audit logs.
 */

// ponytail: persist emails in localStorage so they survive refreshes.
const emails = JSON.parse(localStorage.getItem("workforces_mock_emails") || "[]");
let unreadCount = emails.filter(e => e.unread).length;
let isConsoleOpen = false;
let activeTab = "inbox"; // "inbox" or "telemetry"

// Inject CSS styles for the Unified Developer Console
function injectConsoleStyles() {}

// Render the entire Developer Console HTML structure
function renderDevConsole() {
  const container = document.getElementById("mock-inbox-container");
  if (!container) return;
  
  // Floating Trigger button
  let trigger = container.querySelector(".dev-console-trigger");
  if (!trigger) {
    trigger = document.createElement("div");
    trigger.className = "dev-console-trigger";
    trigger.onclick = toggleDevConsole;
    container.appendChild(trigger);
  }
  
  // Status check for trigger visual indication
  const networkOnline = navigator.onLine;
  
  // Render status elements dynamically inside trigger
  const badgeHTML = unreadCount > 0 
    ? `<span class="dev-console-badge alert">${unreadCount}</span>` 
    : ``;
    
  trigger.innerHTML = `
    <span>⚙️ Dev Console</span>
    ${badgeHTML}
  `;
  
  // Panel content drawer
  let panel = container.querySelector(".dev-console-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.className = "dev-console-panel";
    container.appendChild(panel);
  }
  
  panel.className = `dev-console-panel ${isConsoleOpen ? "show" : ""}`;
  
  // Build interior tabs structure
  const inboxTabClass = activeTab === "inbox" ? "console-tab active" : "console-tab";
  const teleTabClass = activeTab === "telemetry" ? "console-tab active" : "console-tab";
  
  // Build active tab pane content HTML
  let contentHTML = "";
  if (activeTab === "inbox") {
    const sorted = [...emails].sort((a, b) => b.timestamp - a.timestamp);
    const listHTML = sorted.length > 0 
      ? sorted.map(email => `
          <div class="email-item ${email.unread ? "unread" : ""}" onclick="openEmail('${email.id}')">
            <div class="email-item-header">
              <span class="email-sender">${escapeHtml(email.from)}</span>
              <span class="email-time">${formatTime(email.timestamp)}</span>
            </div>
            <span class="email-subject">${escapeHtml(email.subject)}</span>
            <span class="email-preview">${escapeHtml(email.body)}</span>
          </div>
        `).join("")
      : `
        <div class="email-empty-state">
          <svg fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21.75 9v.906a2.25 2.25 0 01-1.183 1.981l-6.478 3.488M2.25 9v.906a2.25 2.25 0 001.183 1.981l6.478 3.488m8.839 2.51l-4.66-2.51m0 0l-1.023-.55a2.25 2.25 0 00-2.134 0l-1.022.55m0 0l-4.661 2.51m16.5 1.615a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V8.844a2.25 2.25 0 011.183-1.981l7.5-4.039a2.25 2.25 0 012.134 0l7.5 4.039a2.25 2.25 0 011.183 1.98V19.5z" />
          </svg>
          <span>Your workspace mock inbox is empty. Verification emails will show up here.</span>
        </div>
      `;
    contentHTML = `
      <div class="email-list">
        ${listHTML}
      </div>
      <div class="email-detail-view" id="email-detail-view"></div>
    `;
  } else {
    // Telemetry tab UI
    const statusDotClass = networkOnline ? "status-dot online" : "status-dot offline";
    const statusText = networkOnline ? "Online" : "Offline";
    const telemetry = window.SyncTelemetry || { successCount: 0, failureCount: 0, conflictCount: 0, recentLogs: [] };
    
    // Attempt to read current IndexedDB queue length asynchronously
    if (window.SyncEngine && typeof window.SyncEngine.getQueueLength === "function") {
      window.SyncEngine.getQueueLength().then(len => {
        const qValEl = document.getElementById("tele-queue-val");
        if (qValEl) qValEl.textContent = len;
      });
    }

    const logItemsHTML = telemetry.recentLogs.length > 0 
      ? telemetry.recentLogs.map(l => `
          <div class="log-item">
            <span class="log-time">[${new Date(l.timestamp).toLocaleTimeString()}]</span>
            <span class="log-text">${escapeHtml(l.message)}</span>
          </div>
        `).join("")
      : `<div style="color: #64748b; font-style: italic;">No execution logs captured.</div>`;

    contentHTML = `
      <div class="telemetry-container">
        <div class="telemetry-grid">
          <div class="telemetry-card">
            <span class="telemetry-label">Network Status</span>
            <span class="telemetry-value">
              <span class="${statusDotClass}"></span> ${statusText}
            </span>
          </div>
          <div class="telemetry-card">
            <span class="telemetry-label">Pending Sync Queue</span>
            <span class="telemetry-value" id="tele-queue-val">Calculating...</span>
          </div>
          <div class="telemetry-card">
            <span class="telemetry-label">Successful Syncs</span>
            <span class="telemetry-value" style="color: #10b981;">
              ✓ ${telemetry.successCount}
            </span>
          </div>
          <div class="telemetry-card">
            <span class="telemetry-label">Conflicts Resolved</span>
            <span class="telemetry-value" style="color: #f59e0b;">
              ⚠ ${telemetry.conflictCount}
            </span>
          </div>
        </div>
        <div class="telemetry-actions">
          <button class="telemetry-btn" onclick="triggerManualSync()">Flush Queue</button>
          <button class="telemetry-btn" onclick="clearTelemetryLogs()">Clear Logs</button>
        </div>
        <div>
          <div class="telemetry-logs-title">Sync Process Logs</div>
          <div class="telemetry-logs-list">
            ${logItemsHTML}
          </div>
        </div>
      </div>
    `;
  }
  
  panel.innerHTML = `
    <div class="console-header">
      <h3 class="console-title">
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="width: 18px; height: 18px; color: #6366f1;">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.43l-1.003.828c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.43l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.645-.869L9.594 3.94zM15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        Dev Sandbox Console
      </h3>
      <button class="console-close" onclick="closeDevConsole()">&times;</button>
    </div>
    <div class="console-tabs">
      <div class="${inboxTabClass}" onclick="switchDevTab('inbox')">Mail Inbox ${unreadCount > 0 ? `(${unreadCount})` : ''}</div>
      <div class="${teleTabClass}" onclick="switchDevTab('telemetry')">Sync Telemetry</div>
    </div>
    <div class="console-content">
      ${contentHTML}
    </div>
  `;
}

// Tab switcher handler
window.switchDevTab = function(tabName) {
  activeTab = tabName;
  renderDevConsole();
};

// Global toggle drawer action
function toggleDevConsole() {
  isConsoleOpen = !isConsoleOpen;
  renderDevConsole();
}

window.closeDevConsole = function () {
  isConsoleOpen = false;
  renderDevConsole();
};

window.triggerManualSync = function() {
  if (window.SyncEngine && typeof window.SyncEngine.sync === "function") {
    window.SyncTelemetry.log("Manual sync trigger requested by developer.");
    window.SyncEngine.sync();
  }
};

window.clearTelemetryLogs = function() {
  if (window.SyncTelemetry) {
    window.SyncTelemetry.recentLogs = [];
    renderDevConsole();
  }
};

// Exposed utility methods to browser context
window.openEmail = function (id) {
  const email = emails.find(e => e.id === id);
  if (!email) return;
  
  if (email.unread) {
    email.unread = false;
    unreadCount = Math.max(0, unreadCount - 1);
    localStorage.setItem("workforces_mock_emails", JSON.stringify(emails));
    renderDevConsole();
  }
  
  const detailEl = document.getElementById("email-detail-view");
  if (!detailEl) return;
  
  detailEl.innerHTML = `
    <button class="email-back-btn" onclick="closeEmailDetail()">
      &larr; Back to list
    </button>
    <div class="email-detail-meta">
      <strong>${escapeHtml(email.subject)}</strong>
      <span>From: ${escapeHtml(email.from)}</span>
      <span>Date: ${new Date(email.timestamp).toLocaleString()}</span>
    </div>
    <div class="email-detail-body">${escapeHtml(email.body)}</div>
  `;
  detailEl.classList.add("show");
};

window.closeEmailDetail = function () {
  const detailEl = document.getElementById("email-detail-view");
  if (detailEl) {
    detailEl.classList.remove("show");
    detailEl.innerHTML = "";
  }
};

// Formatting and escape helpers
function escapeHtml(text) {
  return String(text || "").replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[m]);
}

function formatTime(timestamp) {
  const diff = Date.now() - timestamp;
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

// Expose same lifecycle interface for app bootstrap overrides compatibility
export const MockEmailService = {
  init() {
    // ponytail: only load developer panel in local dev sandbox
    const isDev = new URLSearchParams(window.location.search).has("dev") || ["localhost", "127.0.0.1"].includes(window.location.hostname) || window.location.protocol === "file:";
    if (!isDev) {
      const container = document.getElementById("mock-inbox-container");
      if (container) container.style.display = "none";
      return;
    }
    injectConsoleStyles();
    renderDevConsole();
    
    // Bind to window so global telemetry logger can trigger updates
    window.renderDevConsole = renderDevConsole;
    
    // Also bind network status changes to console rerenders
    window.addEventListener("online", renderDevConsole);
    window.addEventListener("offline", renderDevConsole);
  },
  
  receiveEmail(from, to, subject, body) {
    const newEmail = {
      id: "EML" + Date.now() + Math.random().toString(36).substr(2, 4),
      from,
      to,
      subject,
      body,
      timestamp: Date.now(),
      unread: true
    };
    emails.push(newEmail);
    localStorage.setItem("workforces_mock_emails", JSON.stringify(emails));
    unreadCount++;
    
    // Auto-open panel on OTP receipt to assist candidate flow, switching to inbox
    activeTab = "inbox";
    isConsoleOpen = true;
    renderDevConsole();
  }
};
