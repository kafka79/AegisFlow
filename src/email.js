/**
 * Mock Email & Developer Telemetry Console Module
 * Provides a floating unified developer panel in the bottom right corner of the screen.
 * Resolves the "Simulated SMTP" security flaw and provides real-time transaction sync audit logs.
 */

const emails = [];
let unreadCount = 0;
let isConsoleOpen = false;
let activeTab = "inbox"; // "inbox" or "telemetry"

// Inject CSS styles for the Unified Developer Console
function injectConsoleStyles() {
  const style = document.createElement("style");
  style.textContent = `
    .dev-console-trigger {
      position: fixed;
      bottom: 24px;
      right: 24px;
      padding: 10px 18px;
      border-radius: 9999px;
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #f1f5f9;
      font-size: 0.85rem;
      font-weight: 600;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      z-index: 10000;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      font-family: 'Outfit', sans-serif;
    }
    .dev-console-trigger:hover {
      transform: translateY(-2px);
      background: rgba(15, 23, 42, 0.95);
      border-color: rgba(99, 102, 241, 0.4);
      box-shadow: 0 8px 30px rgba(99, 102, 241, 0.2);
    }
    .dev-console-badge {
      background: #6366f1;
      color: white;
      font-size: 0.7rem;
      font-weight: 700;
      min-width: 18px;
      height: 18px;
      border-radius: 9px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 4px;
      box-sizing: border-box;
    }
    .dev-console-badge.alert {
      background: #ef4444;
    }
    .dev-console-panel {
      position: fixed;
      bottom: 80px;
      right: 24px;
      width: 400px;
      height: 520px;
      border-radius: 16px;
      background: rgba(15, 23, 42, 0.95);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
      display: none;
      flex-direction: column;
      z-index: 10000;
      overflow: hidden;
      font-family: 'Outfit', sans-serif;
      color: #f1f5f9;
      transform: translateY(20px);
      opacity: 0;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .dev-console-panel.show {
      display: flex;
      transform: translateY(0);
      opacity: 1;
    }
    .console-header {
      padding: 14px 16px;
      background: rgba(30, 41, 59, 0.4);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .console-title {
      font-weight: 600;
      font-size: 0.95rem;
      margin: 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .console-close {
      cursor: pointer;
      color: #94a3b8;
      background: none;
      border: none;
      font-size: 1.2rem;
      line-height: 1;
    }
    .console-close:hover {
      color: #f1f5f9;
    }
    .console-tabs {
      display: flex;
      background: rgba(30, 41, 59, 0.2);
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }
    .console-tab {
      flex: 1;
      padding: 10px;
      text-align: center;
      font-size: 0.8rem;
      font-weight: 500;
      cursor: pointer;
      color: #94a3b8;
      transition: all 0.2s ease;
      border-bottom: 2px solid transparent;
    }
    .console-tab:hover {
      color: #cbd5e1;
      background: rgba(255, 255, 255, 0.02);
    }
    .console-tab.active {
      color: #6366f1;
      border-bottom-color: #6366f1;
      background: rgba(99, 102, 241, 0.05);
      font-weight: 600;
    }
    .console-content {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      position: relative;
    }
    
    /* Email styling */
    .email-item {
      padding: 14px 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      cursor: pointer;
      transition: background 0.2s ease;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .email-item:hover {
      background: rgba(255, 255, 255, 0.03);
    }
    .email-item.unread {
      background: rgba(99, 102, 241, 0.05);
      border-left: 3px solid #6366f1;
    }
    .email-item-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .email-sender {
      font-size: 0.8rem;
      color: #94a3b8;
    }
    .email-time {
      font-size: 0.72rem;
      color: #64748b;
    }
    .email-subject {
      font-size: 0.85rem;
      font-weight: 600;
      color: #f8fafc;
    }
    .email-preview {
      font-size: 0.8rem;
      color: #94a3b8;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .email-detail-view {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: #0f172a;
      display: none;
      flex-direction: column;
      padding: 16px;
      box-sizing: border-box;
      z-index: 10;
    }
    .email-detail-view.show {
      display: flex;
    }
    .email-detail-meta {
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      padding-bottom: 12px;
      margin-bottom: 12px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .email-detail-meta strong {
      font-size: 0.95rem;
    }
    .email-detail-meta span {
      font-size: 0.8rem;
      color: #94a3b8;
    }
    .email-detail-body {
      flex: 1;
      font-size: 0.85rem;
      line-height: 1.5;
      color: #cbd5e1;
      overflow-y: auto;
      white-space: pre-wrap;
    }
    .email-back-btn {
      background: rgba(255, 255, 255, 0.08);
      border: none;
      color: #f8fafc;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 0.75rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      align-self: flex-start;
      margin-bottom: 12px;
    }
    .email-back-btn:hover {
      background: rgba(255, 255, 255, 0.12);
    }
    .email-empty-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      color: #64748b;
      padding: 32px;
      text-align: center;
    }
    .email-empty-state svg {
      width: 48px;
      height: 48px;
      opacity: 0.3;
    }

    /* Telemetry styling */
    .telemetry-container {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .telemetry-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
    }
    .telemetry-card {
      background: rgba(30, 41, 59, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .telemetry-label {
      font-size: 0.72rem;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .telemetry-value {
      font-size: 1.1rem;
      font-weight: 700;
      color: #f1f5f9;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
    }
    .status-dot.online { background-color: #10b981; }
    .status-dot.offline { background-color: #ef4444; }
    .status-dot.syncing { background-color: #f59e0b; animation: pulse 1s infinite alternate; }
    @keyframes pulse {
      from { opacity: 0.4; }
      to { opacity: 1; }
    }
    .telemetry-actions {
      display: flex;
      gap: 8px;
    }
    .telemetry-btn {
      flex: 1;
      padding: 8px;
      font-size: 0.75rem;
      font-weight: 600;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(99, 102, 241, 0.1);
      color: #818cf8;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .telemetry-btn:hover {
      background: rgba(99, 102, 241, 0.2);
      border-color: #6366f1;
      color: #f1f5f9;
    }
    .telemetry-logs-title {
      font-size: 0.8rem;
      font-weight: 600;
      color: #cbd5e1;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      padding-bottom: 6px;
      margin-top: 4px;
    }
    .telemetry-logs-list {
      flex: 1;
      max-height: 200px;
      overflow-y: auto;
      border: 1px solid rgba(255, 255, 255, 0.05);
      background: rgba(15, 23, 42, 0.5);
      border-radius: 6px;
      padding: 8px;
      font-family: monospace;
      font-size: 0.72rem;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .log-item {
      display: flex;
      gap: 8px;
      line-height: 1.3;
    }
    .log-time {
      color: #64748b;
      flex-shrink: 0;
    }
    .log-text {
      color: #cbd5e1;
      word-break: break-all;
    }
  `;
  document.head.appendChild(style);
}

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
    unreadCount++;
    
    // Auto-open panel on OTP receipt to assist candidate flow, switching to inbox
    activeTab = "inbox";
    isConsoleOpen = true;
    renderDevConsole();
  }
};
