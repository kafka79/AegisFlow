import {
  getTodayString, getNowTimeString, parseTimeToMs, calculateDaysBetween,
  validateIdFormat, generateEmployeeId, logAudit, getAuditLog,
  calculateProfessionalTax, calculateTDS, getSalaryBreakdown, isHoliday, NATIONAL_HOLIDAYS
} from "../helpers.js";
import { escapeHtml } from "../renderer.js";
import { getStore, getRouter } from "../app-context.js";
import { ICONS, getSidebarHTML, getHeaderHTML, showModal, closeModal } from "./layout.js";
import { showInlineAlert, selectedCalendarDate } from "./shared.js";
export { selectedCalendarDate } from "./shared.js";

export function renderLoginView() {
  window.renderApp(`
    <div class="auth-wrapper">
      <div class="auth-card glass glow-accent animate-fade">
        <div class="auth-header">
          <svg class="auth-logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
          <h2 class="auth-title">WorkForces</h2>
          <p class="auth-subtitle">Login to your HRMS portal</p>
        </div>
        
        <div id="login-alert"></div>

        <form id="login-form" data-wf-submit="handleLoginSubmit(event)">
          <div class="form-group">
            <label for="login-email">Email or Login ID</label>
            <input class="input-ctrl" type="text" id="login-email" required placeholder="admin@odoo.com or ODIAD20260001">
          </div>
          
          <div class="form-group">
            <label for="login-password">Password</label>
            <input class="input-ctrl" type="password" id="login-password" required placeholder="••••••••">
          </div>

          <button class="btn btn-primary" type="submit" style="width: 100%; margin-top: 12px;">Sign In</button>
        </form>

        <div class="auth-footer">
          Don't have a corporate workspace? <a href="#" class="auth-link" data-nav-route="signup">Register Company</a>
        </div>
      </div>
    </div>
  `);
}

export async function handleLoginSubmit(e) {
  e.preventDefault();
  const loginVal = document.getElementById("login-email").value.trim();
  const passVal = document.getElementById("login-password").value;
  const alertDiv = document.getElementById("login-alert");

  try {
    const { MockServer } = await import("../server.js");
    const result = await MockServer.authenticate(loginVal, passVal);
    
    const store = getStore();
    const router = getRouter();
    store.state.currentSession = {
      employeeId: result.employee.id,
      role: result.employee.role,
      token: result.token,
      csrfToken: result.csrfToken
    };
    store.saveState();
    router.navigate("dashboard");
  } catch (err) {
    showInlineAlert(alertDiv, err.message || "Login failed.");
  }
}

export function renderSignupView() {
  window.renderApp(`
    <div class="auth-wrapper">
      <div class="auth-card glass glow-accent animate-fade">
        <div class="auth-header">
          <svg class="auth-logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
          <h2 class="auth-title">Register Workspace</h2>
          <p class="auth-subtitle">Initialize your company's HRMS server</p>
        </div>
        
        <div id="signup-alert"></div>

        <form id="signup-form" data-wf-submit="handleSignupSubmit(event)">
          <div class="form-group">
            <label for="company-name">Company Name</label>
            <input class="input-ctrl" type="text" id="company-name" required placeholder="Odoo India Ltd.">
          </div>

          <div class="form-group">
            <label for="admin-name">Admin Officer Name</label>
            <input class="input-ctrl" type="text" id="admin-name" required placeholder="John Doe">
          </div>

          <div class="form-group">
            <label for="admin-email">Corporate Email Address</label>
            <input class="input-ctrl" type="email" id="admin-email" required placeholder="admin@odoo.com">
          </div>

          <div class="form-group">
            <label for="admin-password">Password</label>
            <input class="input-ctrl" type="password" id="admin-password" required placeholder="••••••••">
          </div>

          <div class="form-group">
            <label for="admin-confirm-password">Confirm Password</label>
            <input class="input-ctrl" type="password" id="admin-confirm-password" required placeholder="Re-enter password">
          </div>

          <button class="btn btn-primary" type="submit" style="width: 100%; margin-top: 12px;">Initialize Space</button>
        </form>

        <div class="auth-footer">
          Already have an active account? <a href="#" class="auth-link" data-nav-route="login">Log In</a>
        </div>
      </div>
    </div>
  `);
}

export async function handleSignupSubmit(e) {
  e.preventDefault();
  const compName = document.getElementById("company-name").value.trim();
  const adminName = document.getElementById("admin-name").value.trim();
  const email = document.getElementById("admin-email").value.trim();
  const pass = document.getElementById("admin-password").value;
  const confirmPass = document.getElementById("admin-confirm-password").value;
  const alertDiv = document.getElementById("signup-alert");

  if (pass.length < 8) {
    if (alertDiv) alertDiv.innerHTML = `<div class="alert-banner alert-error">Password must be at least 8 characters long.</div>`;
    return;
  }

  if (pass !== confirmPass) {
    if (alertDiv) alertDiv.innerHTML = `<div class="alert-banner alert-error">Passwords do not match.</div>`;
    return;
  }

  const newAdmin = {
    id: "",
    name: adminName,
    email: email,
    phone: "+91 99999 99999",
    role: "HR",
    department: "Human Resources",
    manager: "N/A",
    location: "Headquarters",
    dateOfJoining: getTodayString(),
    dob: "1990-01-01",
    address: "HQ Campus, Tech Hub",
    nationality: "Indian",
    gender: "Other",
    maritalStatus: "Single",
    status: "Present",
    wage: 150000,
    bankName: "SBI",
    accountNo: "000000000000",
    ifsc: "SBIN0000000",
    pan: "ABCDE1234F",
    ptoDays: 30,
    sickDays: 15,
    avatar: ""
  };

  try {
    const { MockServer } = await import("../server.js");
    const result = await MockServer.registerUser(newAdmin, pass);
    
    const store = getStore();
    const router = getRouter();
    store.state.currentSession = {
      employeeId: result.employee.id,
      role: "HR",
      token: result.token,
      csrfToken: result.csrfToken
    };
    store.saveState();
    router.navigate("dashboard");
  } catch (err) {
    showInlineAlert(alertDiv, `Registration failed: ${err.message || "Unknown error"}`);
  }
}
