import { escapeHtml } from "../renderer.js";
import { getStore, getRouter } from "../app-context.js";
import { ICONS } from "./icons.js";

export function getSidebarHTML(activeLink) {
  const user = getStore()?.getCurrentUser();
  if (!user) return "";

  return `
    <div class="sidebar">
      <div class="sidebar-brand">
        <svg class="sidebar-logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
        </svg>
        <span class="sidebar-brand-name">WorkForces</span>
      </div>
      <ul class="sidebar-menu">
        <li><a class="sidebar-link ${activeLink === "dashboard" ? "active" : ""}" href="#" data-nav-route="dashboard">${ICONS.dashboard} Dashboard</a></li>
        <li><a class="sidebar-link ${activeLink === "employees" ? "active" : ""}" href="#" data-nav-route="employees">${ICONS.employees} Employees</a></li>
        <li><a class="sidebar-link ${activeLink === "attendance" ? "active" : ""}" href="#" data-nav-route="attendance">${ICONS.attendance} Attendance</a></li>
        <li><a class="sidebar-link ${activeLink === "timeoff" ? "active" : ""}" href="#" data-nav-route="timeoff">${ICONS.timeoff} Time Off</a></li>
        <li><a class="sidebar-link ${activeLink === "payroll" ? "active" : ""}" href="#" data-nav-route="payroll">${ICONS.payroll} Payroll</a></li>
      </ul>
    </div>
  `;
}

export function getHeaderHTML(title) {
  const user = getStore()?.getCurrentUser();
  if (!user) return "";

  const userName = user.name || "User";
  const userRole = user.role || "Employee";
  const initials = userName.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase();
  const avatarSrc = user.avatar || window.getCachedAvatar?.(user.id, initials) || `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="50" fill="%236366f1"/><text x="50" y="55" font-family="'Outfit', sans-serif" font-size="32" font-weight="700" fill="white" text-anchor="middle" dominant-baseline="middle">${initials}</text></svg>`;

  return `
    <header class="top-header">
      <h1 class="view-title">${escapeHtml(title)}</h1>
      <div class="header-actions">
        <div id="sync-status-indicator" class="sync-status-indicator" role="status" aria-live="polite" aria-atomic="true" style="display: none;">
          <span class="sync-spinner"></span>
          <span class="sync-status-text">Syncing...</span>
        </div>
        <div class="profile-dropdown-container">
          <div class="user-profile-trigger" data-wf-click="toggleProfileDropdown(event)">
            <img class="user-avatar" src="${avatarSrc}" alt="Avatar">
            <div class="user-details">
              <span class="user-name">${escapeHtml(userName)}</span>
              <span class="user-role">${userRole === "HR" ? "Admin / HR" : "Employee"}</span>
            </div>
          </div>
          <div id="dropdown-menu" class="profile-dropdown">
            <button class="dropdown-item" type="button" data-nav-route="profile" data-nav-params='${JSON.stringify({ id: user.id })}'>
              ${ICONS.user} My Profile
            </button>
            <div class="dropdown-divider"></div>
            <button class="dropdown-item danger" type="button" data-wf-click="handleLogout()">
              ${ICONS.logout} Log Out
            </button>
          </div>
        </div>
      </div>
    </header>
  `;
}

export function toggleProfileDropdown(event) {
  event.stopPropagation();
  document.getElementById("dropdown-menu")?.classList.toggle("show");
}

export function handleLogout() {
  const store = getStore();
  const router = getRouter();
  if (!store || !router) return;
  store.state.currentSession = null;
  store.saveState();
  router.navigate("login");
}

export function getModalHTML(title, bodyHTML) {
  return `
    <div class="modal-content glass glow-accent">
      <div class="modal-header">
        <h3 class="modal-title">${escapeHtml(title)}</h3>
        <button class="modal-close" type="button" data-wf-click="closeModal()">&times;</button>
      </div>
      <div class="modal-body">${bodyHTML}</div>
    </div>
  `;
}

export function showModal(title, bodyHTML) {
  const container = document.getElementById("modal-container");
  if (!container) return;
  container.innerHTML = getModalHTML(title, bodyHTML);
  container.classList.add("show");
}

export function closeModal() {
  const container = document.getElementById("modal-container");
  if (!container) return;
  container.classList.remove("show");
  container.innerHTML = "";
}

if (typeof window !== "undefined") {
  window.getSidebarHTML = getSidebarHTML;
  window.getHeaderHTML = getHeaderHTML;
  window.toggleProfileDropdown = toggleProfileDropdown;
  window.handleLogout = handleLogout;
  window.getModalHTML = getModalHTML;
  window.showModal = showModal;
  window.closeModal = closeModal;
}

document.addEventListener("click", () => {
  document.getElementById("dropdown-menu")?.classList.remove("show");
});

export { ICONS };
