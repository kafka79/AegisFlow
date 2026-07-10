import { sha256 } from "./src/crypto.js";
import { MockServer } from "./src/server.js";
import { SyncEngine } from "./src/sync.js";
import { initDOMRenderer } from "./src/renderer.js";
import { MockEmailService } from "./src/email.js";

/**
 * WorkForces HRMS Overrides Orchestrator
 * Bootstraps the modular components and overrides global state variables.
 */

// Local Client Database for File Cache (prevents quota issues in localStorage)
const CLIENT_DB_NAME = "workforces_client_db";
const CLIENT_DB_VERSION = 1;
let clientDb = null;
const avatarCache = {};
let clientDbReady = false;
const clientDbReadyCallbacks = [];

function initClientDB(callback) {
  const request = indexedDB.open(CLIENT_DB_NAME, CLIENT_DB_VERSION);
  request.onerror = (e) => {
    console.error("Client Local IndexedDB failed to open:", e);
    clientDbReady = true;
    if (callback) callback();
    clientDbReadyCallbacks.forEach(cb => cb());
  };
  request.onsuccess = (e) => {
    clientDb = e.target.result;
    clientDbReady = true;
    if (callback) callback();
    clientDbReadyCallbacks.forEach(cb => cb());
  };
  request.onupgradeneeded = (e) => {
    const activeDb = e.target.result;
    if (!activeDb.objectStoreNames.contains("files")) {
      activeDb.createObjectStore("files", { keyPath: "id" });
    }
  };
}

function saveLocalFile(id, blob, callback) {
  if (!clientDb) {
    if (callback) callback();
    return;
  }
  try {
    const tx = clientDb.transaction("files", "readwrite");
    const store = tx.objectStore("files");
    store.put({ id: id, data: blob });
    tx.oncomplete = () => { if (callback) callback(); };
    tx.onerror = (e) => {
      console.error("Local file save failed:", e.target.error);
      if (e.target.error && e.target.error.name === "QuotaExceededError") {
        window.showToast?.("Storage full. Could not save file.", "error");
      }
      if (callback) callback();
    };
  } catch (e) {
    console.error("Local file save failed", e);
    if (callback) callback();
  }
}

function getLocalFile(id, callback) {
  if (!clientDb) {
    if (callback) callback(null);
    return;
  }
  try {
    const tx = clientDb.transaction("files", "readonly");
    const store = tx.objectStore("files");
    const request = store.get(id);
    request.onsuccess = () => {
      if (request.result && request.result.data) {
        callback(request.result.data);
      } else {
        callback(null);
      }
    };
    request.onerror = () => callback(null);
  } catch (e) {
    console.error("Local file read failed", e);
    callback(null);
  }
}

function deleteLocalFile(id, callback) {
  if (!clientDb) {
    if (callback) callback();
    return;
  }
  try {
    const tx = clientDb.transaction("files", "readwrite");
    const store = tx.objectStore("files");
    store.delete(id);
    tx.oncomplete = () => { if (callback) callback(); };
  } catch (e) {
    console.error("Local file delete failed", e);
    if (callback) callback();
  }
}

// Toast UX Notifications
function showToast(message, type = "info") {
  let toastContainer = document.getElementById("toast-container");
  if (!toastContainer) {
    toastContainer = document.createElement("div");
    toastContainer.id = "toast-container";
    document.body.appendChild(toastContainer);
  }
  const toast = document.createElement("div");
  toast.className = `toast toast-${type} glass glow-accent animate-fade`;
  toast.innerHTML = `<span>${text(message)}</span><button class="toast-close-btn" onclick="this.parentElement.remove()">&times;</button>`;
  toastContainer.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-10px)";
    toast.style.transition = "all 0.5s ease";
    setTimeout(() => toast.remove(), 500);
  }, 4500);
}
window.showToast = showToast;

// HTML Helpers & Formatting Functions
function text(value) {
  return String(value ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[m]);
}
window.text = text;

function attr(value) {
  return text(value).replace(/`/g, "&#96;");
}
window.attr = attr;

function normalizeId(value) {
  return String(value || "").trim().toUpperCase();
}

function initials(name) {
  const value = String(name || "WF").trim().split(/\s+/).filter(Boolean).map(p => p[0]).join("");
  return (value || "WF").slice(0, 2).toUpperCase();
}

function passwordFailures(password) {
  const failures = [];
  if (password.length < 8) failures.push("8+ characters");
  if (!/[A-Z]/.test(password)) failures.push("uppercase letter");
  if (!/[a-z]/.test(password)) failures.push("lowercase letter");
  if (!/[0-9]/.test(password)) failures.push("number");
  if (!/[^A-Za-z0-9]/.test(password)) failures.push("special character");
  return failures;
}

function money(value) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value) || 0);
}
window.money = money;

function hours(value) {
  const numeric = Number(value) || 0;
  return numeric > 0 ? numeric.toFixed(2) + " hrs" : "--:--";
}
window.hours = hours;

function statusClass(status) {
  return String(status || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function attendanceStatus(log) {
  if (!log) return "Absent";
  if (log.status === "Leave") return "Leave";
  const hours = Number(log.workHours) || 0;
  if (hours > 0 && hours < 4) return "Half-day";
  if (hours >= 4 || log.checkIn) return "Present";
  return log.status || "Absent";
}

function statusBadge(status) {
  const value = text(status || "Absent");
  return `<span class="status-badge ${statusClass(value)}">${value}</span>`;
}
window.statusBadge = statusBadge;

function dateFromISO(value) {
  const parts = String(value || "").split("-").map(Number);
  return new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
}

function isoDate(date) {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}

function currentWeekDates() {
  const base = dateFromISO(getTodayString());
  const monday = new Date(base);
  monday.setDate(base.getDate() - ((base.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, idx) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + idx);
    return isoDate(day);
  });
}

function employeeDayStatus(empId, date) {
  const leave = store.state.timeOff.find(item => 
    item.employeeId === empId && item.status === "Approved" && date >= item.startDate && date <= item.endDate
  );
  if (leave) return "Leave";
  const log = store.state.attendance.find(item => item.employeeId === empId && item.date === date);
  if (log) return attendanceStatus(log);
  const day = dateFromISO(date).getDay();
  return day === 0 || day === 6 ? "Weekend" : "Absent";
}

// Router interceptor configuration
let isRouterHooked = false;
function hookRouter() {
  if (isRouterHooked || typeof router === "undefined") return;
  isRouterHooked = true;
  const originalHandleRoute = router.handleRoute.bind(router);
  router.handleRoute = function () {
    if (!clientDbReady) {
      clientDbReadyCallbacks.push(() => originalHandleRoute());
      window.renderApp(`
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: 'Outfit', sans-serif; background: #0b0f19; color: #fff;">
          <div class="spinner" style="border: 4px solid rgba(255,255,255,0.1); border-top: 4px solid #6366f1; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin-bottom: 16px;"></div>
          <p style="color: var(--text-muted); font-size: 0.9rem;">Connecting to Secure Storage...</p>
          <style>
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          </style>
        </div>
      `);
      return;
    }
    originalHandleRoute();
  };
}

// Expose cloud sync status variables to UI status checker
let currentSyncBadgeStatus = { status: "online", count: 0 };
function updateSyncBadgeUI(status, count) {
  currentSyncBadgeStatus = { status, count };
  const badge = document.getElementById("cloud-sync-status");
  if (!badge) return;
  
  const dot = badge.querySelector(".sync-dot");
  const textSpan = badge.querySelector(".sync-text");
  if (!dot || !textSpan) return;
  
  if (status === "online") {
    dot.className = "sync-dot";
    dot.style.background = "#10b981";
    textSpan.textContent = "Cloud Synced";
  } else if (status === "syncing") {
    dot.className = "sync-dot syncing";
    dot.style.background = "#eab308";
    textSpan.textContent = `Syncing (${count})...`;
  } else {
    dot.className = "sync-dot";
    dot.style.background = "#ef4444";
    textSpan.textContent = `Offline - Pending (${count})`;
  }
}

// Hook state management saveState events
const originalSaveState = store.saveState.bind(store);
store.saveState = function () {
  originalSaveState();
  if (store.listeners) {
    store.listeners.forEach(l => {
      try { l(store.state); } catch (e) { console.error(e); }
    });
  }
};

// ==========================================
// STORE METHOD WRAPPERS & SECURE SYNC INTEGRATION
// ==========================================
store.updateEmployee = function (id, fields) {
  const idx = this.state.employees.findIndex(e => e.id === id);
  if (idx !== -1) {
    this.state.employees[idx] = { ...this.state.employees[idx], ...fields };
    this.saveState();
    
    // Log mutation transaction to sync queue
    SyncEngine.enqueue("UPDATE", "employees", this.state.employees[idx]);
    return true;
  }
  return false;
};

store.addEmployee = function (emp, password) {
  const year = new Date(emp.dateOfJoining).getFullYear();
  const yearEmps = this.state.employees.filter(e => new Date(e.dateOfJoining).getFullYear() === year);
  // ponytail: secure UUID fragment to prevent collisions
  const nextSerial = crypto.randomUUID().replace(/-/g, "").substring(0, 12).toUpperCase();
  const nameParts = emp.name.trim().split(" ");
  const initialsText = ((nameParts[0]?.[0] || "E") + (nameParts[nameParts.length - 1]?.[0] || "X")).toUpperCase();
  const generatedId = `ODI${initialsText}${year}${nextSerial}`;
  
  emp.id = generatedId;
  emp.status = "Absent";
  emp.ptoDays = 30;
  emp.sickDays = 15;
  emp.documents = [];
  
  this.state.employees.push(emp);
  this.saveState();
  
  // Register in Mock Backend Server Database and local Sync Queue
  const sessionToken = store.state.currentSession ? store.state.currentSession.token : null;
  MockServer.registerUser(emp, password, sessionToken).then(({ token }) => {
    // Keep local session aligned
    if (store.state.currentSession && store.state.currentSession.employeeId === emp.id) {
      store.state.currentSession.token = token;
      store.saveState();
    }
  }).catch(err => {
    console.error("[SERVER] Registration failed:", err);
  });
  
  SyncEngine.enqueue("ADD", "employees", emp);
  return emp;
};

const originalCheckIn = store.checkIn.bind(store);
store.checkIn = function (empId) {
  const record = originalCheckIn(empId);
  if (record) {
    SyncEngine.enqueue("PUT", "attendance", record);
  }
  return record;
};

const originalCheckOut = store.checkOut.bind(store);
store.checkOut = function (empId) {
  const record = originalCheckOut(empId);
  if (record) {
    record.status = attendanceStatus(record);
    this.saveState();
    SyncEngine.enqueue("PUT", "attendance", record);
  }
  return record;
};

store.applyLeave = function (leaveRequest) {
  leaveRequest.id = "LV" + Date.now();
  leaveRequest.status = "Pending";
  leaveRequest.comment = "";
  this.state.timeOff.push(leaveRequest);
  this.saveState();
  
  SyncEngine.enqueue("PUT", "timeoff", leaveRequest);
};

store.updateLeaveStatus = function (leaveId, status, comment) {
  const leave = this.state.timeOff.find(l => l.id === leaveId);
  if (!leave) return false;
  
  const alreadyApproved = leave.status === "Approved" || leave.deducted === true;
  
  if (status === "Approved" && alreadyApproved) {
    leave.comment = comment;
    this.saveState();
    SyncEngine.enqueue("PUT", "timeoff", leave);
    return true;
  }
  
  if (status !== "Approved" && alreadyApproved) {
    const emp = this.getEmployee(leave.employeeId);
    const days = calculateDaysBetween(leave.startDate, leave.endDate);
    if (emp) {
      if (leave.leaveType === "Paid Time Off") {
        emp.ptoDays = emp.ptoDays + days;
      } else if (leave.leaveType === "Sick Leave") {
        emp.sickDays = emp.sickDays + days;
      }
      this.updateEmployee(emp.id, emp);
    }
    leave.deducted = false;
  }
  
  leave.status = status;
  leave.comment = comment;
  if (status === "Approved" && !alreadyApproved) {
    leave.deducted = true;
    const emp = this.getEmployee(leave.employeeId);
    const days = calculateDaysBetween(leave.startDate, leave.endDate);
    if (emp) {
      if (leave.leaveType === "Paid Time Off") {
        emp.ptoDays = Math.max(0, emp.ptoDays - days);
      } else if (leave.leaveType === "Sick Leave") {
        emp.sickDays = Math.max(0, emp.sickDays - days);
      }
      const todayStr = getTodayString();
      if (todayStr >= leave.startDate && todayStr <= leave.endDate) {
        emp.status = "Leave";
      }
      this.updateEmployee(emp.id, emp);
    }
  }
  this.saveState();
  SyncEngine.enqueue("PUT", "timeoff", leave);
  return true;
};

// Document File Handler Overrides
store.addEmployeeDocument = function (empId, doc) {
  const emp = store.getEmployee(empId);
  if (!emp) return false;
  emp.documents = Array.isArray(emp.documents) ? emp.documents : [];
  const docId = "DOC" + Date.now();
  
  // Save local blob
  saveLocalFile(docId, doc.data, () => {
    showToast("Document saved locally.", "success");
    
    // Sync file binary payload to server document storage
    const stateStr = localStorage.getItem("workforces_state");
    if (stateStr) {
      try {
        const state = JSON.parse(stateStr);
        const token = state.currentSession ? state.currentSession.token : null;
        if (token) {
          MockServer.saveDocument(token, docId, doc.data).then(() => {
            showToast("Document uploaded securely to server.", "success");
          });
        }
      } catch(e) { console.error(e); }
    }
  });

  emp.documents.unshift({ 
    id: docId, 
    name: doc.name, 
    type: doc.type, 
    uploadedAt: new Date().toISOString() 
  });
  this.saveState();
  SyncEngine.enqueue("UPDATE", "employees", emp);
  return true;
};

store.deleteEmployeeDocument = function (empId, docId) {
  const emp = store.getEmployee(empId);
  if (!emp || !Array.isArray(emp.documents)) return false;
  emp.documents = emp.documents.filter(doc => doc.id !== docId);
  
  deleteLocalFile(docId, () => {
    showToast("Document deleted locally.", "success");
    
    const stateStr = localStorage.getItem("workforces_state");
    if (stateStr) {
      try {
        const state = JSON.parse(stateStr);
        const token = state.currentSession ? state.currentSession.token : null;
        if (token) {
          MockServer.deleteDocument(token, docId).then(() => {
            showToast("Document removed from server.", "success");
          });
        }
      } catch(e) { console.error(e); }
    }
  });
  
  this.saveState();
  SyncEngine.enqueue("UPDATE", "employees", emp);
  return true;
};

// ==========================================
// AUTHENTICATION VIEWS & FORM HANDLERS
// ==========================================
window.handleLoginSubmit = async function (e) {
  e.preventDefault();
  const loginVal = document.getElementById("login-email").value.trim();
  const passVal = document.getElementById("login-password").value;
  const alertDiv = document.getElementById("login-alert");

  try {
    // Authenticate through the private Mock Backend Server closure
    const { token, employee } = await MockServer.authenticate(loginVal, passVal);
    
    store.state.currentSession = {
      employeeId: employee.id,
      role: employee.role,
      token: token
    };
    
    // Populate client local state variables
    const serverEmployees = await MockServer.getEmployees(token);
    store.state.employees = serverEmployees;
    store.saveState();
    
    router.navigate("dashboard");
    showToast(`Welcome back, ${employee.name}!`, "success");
  } catch (err) {
    alertDiv.innerHTML = `
      <div class="alert-banner alert-error">
        <span>${text(err.message)}</span>
      </div>
    `;
  }
};

window.handleSignupSubmit = async function (e) {
  e.preventDefault();
  const compName = document.getElementById("company-name").value.trim();
  const adminName = document.getElementById("admin-name").value.trim();
  const email = document.getElementById("admin-email").value.trim();
  const pass = document.getElementById("admin-password").value;
  const confirmPass = document.getElementById("admin-confirm-password").value;
  const alertDiv = document.getElementById("signup-alert");

  if (pass.length < 8) {
    alertDiv.innerHTML = `<div class="alert-banner alert-error">Password must be at least 8 characters long.</div>`;
    return;
  }

  const failures = passwordFailures(pass);
  if (failures.length) {
    alertDiv.innerHTML = `<div class="alert-banner alert-error">Password requirements: ${failures.join(", ")}</div>`;
    return;
  }

  if (pass !== confirmPass) {
    alertDiv.innerHTML = `<div class="alert-banner alert-error">Passwords do not match.</div>`;
    return;
  }

  const newAdmin = {
    id: "ODIAD20260001",
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
    const { token, employee } = await MockServer.registerUser(newAdmin, pass);
    store.state.currentSession = {
      employeeId: employee.id,
      role: "HR",
      token: token
    };
    
    // Sync state locally
    store.state.employees = [employee];
    store.saveState();
    
    router.navigate("dashboard");
    showToast("Workspace account registered successfully!", "success");
  } catch (err) {
    alertDiv.innerHTML = `<div class="alert-banner alert-error">Registration failed: ${text(err.message)}</div>`;
  }
};

let pendingSignup = null;

window.renderSignupView = function () {
  pendingSignup = null;
  window.renderApp(`
    <div class="auth-wrapper">
      <div class="auth-card glass glow-accent animate-fade">
        <div class="auth-header">
          <svg class="auth-logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
          <h2 class="auth-title">Register Workspace Account</h2>
          <p class="auth-subtitle">Verify email and configure password</p>
        </div>

        <div id="signup-alert"></div>

        <form id="signup-form" onsubmit="handleSignupSubmitOverrides(event)">
          <div class="form-group">
            <label for="signup-employee-id">Employee ID</label>
            <input class="input-ctrl" type="text" id="signup-employee-id" required placeholder="ODIXX20260004">
          </div>

          <div class="form-group">
            <label for="signup-name">Full Name</label>
            <input class="input-ctrl" type="text" id="signup-name" required placeholder="Jane Doe">
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="signup-email">Corporate Email</label>
              <input class="input-ctrl" type="email" id="signup-email" required placeholder="jane.doe@company.com">
            </div>
            <div class="form-group">
              <label for="signup-role">Role</label>
              <select class="input-ctrl" id="signup-role" required>
                <option value="Employee">Employee</option>
                <option value="HR">HR Officer</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label for="signup-password">Password</label>
            <input class="input-ctrl" type="password" id="signup-password" required placeholder="8+ chars, mixed case, number, symbol">
          </div>

          <div class="form-group">
            <label for="signup-confirm-password">Confirm Password</label>
            <input class="input-ctrl" type="password" id="signup-confirm-password" required placeholder="Re-enter password">
          </div>

          <div class="form-group" id="verification-row" style="display: none;">
            <label for="signup-code">Email Verification Code</label>
            <input class="input-ctrl" type="text" id="signup-code" inputmode="numeric" placeholder="Enter 6-digit code">
          </div>

          <button class="btn btn-primary" id="signup-submit-btn" type="submit" style="width: 100%; margin-top: 12px;">Send Verification Code</button>
        </form>

        <div class="auth-footer">
          Already have an active account? <a href="#login" class="auth-link">Log In</a>
        </div>
      </div>
    </div>
  `;
};

window.handleSignupSubmitOverrides = async function (event) {
  event.preventDefault();
  const alertDiv = document.getElementById("signup-alert");
  const employeeId = normalizeId(document.getElementById("signup-employee-id").value);
  const name = document.getElementById("signup-name").value.trim();
  const email = document.getElementById("signup-email").value.trim();
  const role = document.getElementById("signup-role").value;
  const password = document.getElementById("signup-password").value;
  const confirm = document.getElementById("signup-confirm-password").value;

  if (!pendingSignup) {
    const failures = passwordFailures(password);
    if (failures.length) {
      alertDiv.innerHTML = `<div class="alert-banner alert-error">Password requirements: ${failures.join(", ")}</div>`;
      return;
    }
    if (password !== confirm) {
      alertDiv.innerHTML = `<div class="alert-banner alert-error">Passwords do not match.</div>`;
      return;
    }
    
    // Generate verification code
    const code = String(Math.floor(100000 + Math.random() * 900000));
    pendingSignup = { employeeId, name, email, role, password, code };
    
    document.getElementById("verification-row").style.display = "flex";
    document.getElementById("signup-submit-btn").textContent = "Verify & Create Account";
    
    // Dispatch real email message to user's Mock Inbox widget
    MockEmailService.receiveEmail(
      "Workspace Authentication Service",
      email,
      "Workspace Account Verification Code",
      `Hello ${name},\n\nYour account activation code is: ${code}\n\nEnter this code in the registration screen to complete your setup.`
    );
    
    alertDiv.innerHTML = `<div class="alert-banner alert-success">Verification code sent to <strong>${text(email)}</strong>. Open the Mock Inbox widget in the bottom right corner to read it!</div>`;
    showToast("Verification code dispatched to Mock Inbox.", "success");
    return;
  }

  const codeVal = document.getElementById("signup-code").value.trim();
  if (codeVal !== pendingSignup.code) {
    alertDiv.innerHTML = `<div class="alert-banner alert-error">Verification code is incorrect.</div>`;
    return;
  }

  // Create new profile record
  const employee = {
    id: pendingSignup.employeeId,
    name: pendingSignup.name,
    email: pendingSignup.email,
    phone: "",
    role: pendingSignup.role,
    department: pendingSignup.role === "HR" ? "Human Resources" : "Engineering",
    manager: pendingSignup.role === "HR" ? "N/A" : "HR Admin",
    location: "Headquarters",
    dateOfJoining: getTodayString(),
    dob: "",
    address: "",
    nationality: "Indian",
    gender: "Other",
    maritalStatus: "Single",
    status: "Present",
    wage: pendingSignup.role === "HR" ? 150000 : 80000,
    bankName: "TBD",
    accountNo: "TBD",
    ifsc: "TBD",
    pan: "TBD",
    ptoDays: 30,
    sickDays: 15,
    avatar: "",
    personalEmail: "",
    documents: []
  };

  try {
    const { token } = await MockServer.registerUser(employee, pendingSignup.password);
    store.state.currentSession = {
      employeeId: employee.id,
      role: employee.role,
      token: token
    };
    
    // Sync cache state
    store.state.employees.push(employee);
    store.saveState();
    
    pendingSignup = null;
    router.navigate("dashboard");
    showToast("Workspace profile registered and authenticated!", "success");
  } catch (err) {
    alertDiv.innerHTML = `<div class="alert-banner alert-error">Registration failed: ${text(err.message)}</div>`;
  }
};

// ==========================================
// HEADER AND VIEW OVERRIDES
// ==========================================
window.getHeaderHTML = function (title) {
  const user = store.getCurrentUser();
  if (!user) return "";
  const avatarSrc = avatarFor(user, "#6366f1", "#ffffff");
  
  // Render layout header including synchronization status and dropdowns
  return `
    <header class="top-header">
      <div style="display: flex; align-items: center;">
        <h1 class="view-title" style="margin-right: 24px;">${title}</h1>
        <div class="cloud-sync-badge" id="cloud-sync-status">
          <span class="sync-dot"></span>
          <span class="sync-text">Loading...</span>
        </div>
      </div>
      <div class="header-actions">
        <div class="profile-dropdown-container">
          <div class="user-profile-trigger" onclick="toggleProfileDropdown(event)">
            <img class="user-avatar" data-avatar-id="${user.id}" src="${avatarSrc}" alt="Avatar">
            <div class="user-details">
              <span class="user-name">${user.name}</span>
              <span class="user-role">${user.role === 'HR' ? 'Admin / HR' : 'Employee'}</span>
            </div>
          </div>
          <div id="dropdown-menu" class="profile-dropdown">
            <button class="dropdown-item" onclick="router.navigate('profile', { id: '${user.id}' })">
              My Profile
            </button>
            <div class="dropdown-divider"></div>
            <button class="dropdown-item danger" onclick="handleLogout()">
              Log Out
            </button>
          </div>
        </div>
      </div>
    </header>
  `;
};

// Hook header changes to sync status indicators
setInterval(() => {
  updateSyncBadgeUI(currentSyncBadgeStatus.status, currentSyncBadgeStatus.count);
}, 500);

const originalRenderDashboard = renderDashboardView;
window.renderDashboardView = function () {
  originalRenderDashboard();
  const user = store.getCurrentUser();
  if (!user || user.role === "HR") return;
  const grid = document.querySelector(".dashboard-grid");
  if (!grid) return;
  
  grid.insertAdjacentHTML("beforeend", `
    <div class="quick-action-grid glass animate-fade">
      <button class="quick-action-btn" onclick="router.navigate('profile', { id: '${attr(user.id)}' })">Profile</button>
      <button class="quick-action-btn" onclick="router.navigate('attendance')">Attendance</button>
      <button class="quick-action-btn" onclick="router.navigate('timeoff')">Leave Requests</button>
      <button class="quick-action-btn danger" onclick="handleLogout()">Logout</button>
    </div>
  `);
};

window.getEmployeeCardHTML = function (emp) {
  const today = getTodayString();
  const status = employeeDayStatus(emp.id, today);
  const cls = status === "Leave" ? "leave" : status === "Present" || status === "Half-day" ? "present" : "absent";
  const avatar = avatarFor(emp, "#1f2937", "#6366f1");
  return `
    <div class="employee-card glass glow-accent animate-fade" onclick="router.navigate('profile', { id: '${attr(emp.id)}' })">
      <span class="card-status-dot ${cls}"></span>
      <img class="card-avatar" data-avatar-id="${emp.id}" src="${attr(avatar)}" alt="Avatar">
      <h4 class="card-name">${text(emp.name)}</h4>
      <span class="card-role">${text(emp.role === "HR" ? "HR Manager" : emp.role)}</span>
      <span style="font-size: 0.8rem; color: var(--text-muted);">${text(emp.department)}</span>
      <span class="card-id">${text(emp.id)}</span>
    </div>
  `;
};

window.renderEmployeesView = async function () {
  const user = store.getCurrentUser();
  const isAdmin = user.role === "HR";
  const employees = isAdmin ? store.state.employees : [user];

  const content = `
    <div class="directory-actions animate-fade">
      <div class="search-filter-grp">
        <input class="input-ctrl" type="text" id="employee-search" oninput="filterEmployees()" placeholder="Search employee name, department, ID...">
        <select class="input-ctrl" id="employee-filter-status" onchange="filterEmployees()" style="width: 160px;">
          <option value="all">All Statuses</option>
          <option value="Present">Present</option>
          <option value="Half-day">Half-day</option>
          <option value="Leave">On Leave</option>
          <option value="Absent">Absent</option>
        </select>
      </div>
      ${isAdmin ? `<button class="btn btn-primary" onclick="showOnboardModal()">Add Employee</button>` : ""}
    </div>

    <div class="employee-grid animate-fade" id="employee-grid-container">
      ${employees.map(getEmployeeCardHTML).join("")}
    </div>
  `;
  
  window.renderApp(`
    ${getSidebarHTML("employees")}
    <div class="main-wrapper">
      ${getHeaderHTML(isAdmin ? "Employee Directory" : "My Employee Record")}
      <div class="view-container">
        ${content}
      </div>
    </div>
  `);
};

window.filterEmployees = function () {
  const user = store.getCurrentUser();
  const isAdmin = user.role === "HR";
  const query = document.getElementById("employee-search").value.toLowerCase();
  const statusFilter = document.getElementById("employee-filter-status").value;
  const grid = document.getElementById("employee-grid-container");
  const today = getTodayString();
  const source = isAdmin ? store.state.employees : [user];

  const filtered = source.filter(emp => {
    const status = employeeDayStatus(emp.id, today);
    const matchesSearch = emp.name.toLowerCase().includes(query) || emp.id.toLowerCase().includes(query) || emp.department.toLowerCase().includes(query) || emp.role.toLowerCase().includes(query);
    const matchesStatus = statusFilter === "all" || status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  grid.innerHTML = filtered.map(getEmployeeCardHTML).join("") || `<div class="empty-state glass">No employees match this filter.</div>`;
};

// Profile view document support
function renderDocumentsHTML(empId) {
  const current = store.getCurrentUser();
  const emp = store.getEmployee(empId);
  const canEdit = current && (current.role === "HR" || current.id === empId);
  const docs = Array.isArray(emp.documents) ? emp.documents : [];
  return `
    <h4 style="margin-bottom: 20px; font-weight: 600; color: var(--accent);">Employee Documents</h4>
    ${canEdit ? `
      <div class="document-upload-row">
        <input class="input-ctrl" type="file" id="document-upload-input" onchange="handleDocumentUpload(event, '${attr(empId)}')">
        <span class="document-help">PDF or image files up to 2 MB stored securely.</span>
      </div>
    ` : ""}
    <div class="document-list" id="document-list">
      ${docs.map(doc => `
          <div class="document-item">
            <div>
              <strong>${text(doc.name)}</strong>
              <span>${text(doc.type || "Unknown type")} - ${new Date(doc.uploadedAt).toLocaleDateString()}</span>
            </div>
            <div class="document-actions">
              <button class="btn btn-secondary btn-sm" onclick="downloadEmployeeDocument('${attr(empId)}', '${attr(doc.id)}', '${attr(doc.name)}')">Download</button>
              ${canEdit ? `<button class="btn btn-danger btn-sm" onclick="deleteEmployeeDocument('${attr(empId)}', '${attr(doc.id)}')">Delete</button>` : ""}
            </div>
          </div>
        `).join("") || `<div class="empty-state">No employee documents uploaded yet.</div>`}
    </div>
  `;
}

window.downloadEmployeeDocument = function (empId, docId, docName) {
  getLocalFile(docId, (data) => {
    if (!data) {
      showToast("Document not found in local cache.", "error");
      return;
    }
    const url = (data instanceof Blob) ? URL.createObjectURL(data) : data;
    const link = document.createElement("a");
    link.href = url;
    link.download = docName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (data instanceof Blob) {
      setTimeout(() => URL.revokeObjectURL(url), 100);
    }
    showToast("Downloading file...", "success");
  });
};

function injectDocumentsTab(empId) {
  const emp = store.getEmployee(empId);
  const current = store.getCurrentUser();
  if (!emp || !current || (current.role !== "HR" && current.id !== empId)) return;
  
  const nav = document.querySelector(".tab-nav");
  const panel = document.querySelector(".tabs-panel");
  if (!nav || !panel || document.getElementById("documents-info")) return;
  
  nav.insertAdjacentHTML("beforeend", `<button class="tab-btn" onclick="switchProfileTab(event, 'documents-info')">Documents</button>`);
  panel.insertAdjacentHTML("beforeend", `<div id="documents-info" class="tab-content glass" style="padding: 32px;">${renderDocumentsHTML(empId)}</div>`);
}

const originalRenderProfile = renderProfileView;
window.renderProfileView = function (params) {
  const current = store.getCurrentUser();
  const targetId = normalizeId(params && params.id);
  if (current && current.role !== "HR" && targetId !== current.id) {
    router.navigate("profile", { id: current.id });
    return;
  }
  originalRenderProfile(params);
  injectDocumentsTab(targetId);
};

window.handleDocumentUpload = function (event, empId) {
  const file = event.target.files[0];
  if (!file) return;
  const current = store.getCurrentUser();
  if (!current || (current.role !== "HR" && current.id !== empId)) return;
  if (!(file.type.startsWith("image/") || file.type === "application/pdf")) {
    showToast("Upload a PDF or image document.", "error");
    event.target.value = "";
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    showToast("Document must be under 2 MB.", "error");
    event.target.value = "";
    return;
  }
  
  store.addEmployeeDocument(empId, { name: file.name, type: file.type, data: file });
  renderProfileView({ id: empId });
  const docButton = Array.from(document.querySelectorAll(".tab-btn")).find(button => button.textContent.trim() === "Documents");
  if (docButton) docButton.click();
};

window.deleteEmployeeDocument = function (empId, docId) {
  const current = store.getCurrentUser();
  if (!current || (current.role !== "HR" && current.id !== empId)) return;
  store.deleteEmployeeDocument(empId, docId);
  renderProfileView({ id: empId });
  const docButton = Array.from(document.querySelectorAll(".tab-btn")).find(button => button.textContent.trim() === "Documents");
  if (docButton) docButton.click();
};

window.handlePasswordUpdate = async function (e, empId) {
  e.preventDefault();
  const current = document.getElementById("current-password").value;
  const newPass = document.getElementById("new-password-input").value;
  const confirm = document.getElementById("confirm-password-input").value;

  const userAccount = store.state.users.find(u => u.employeeId === empId);
  if (!userAccount) return;

  if (newPass.length < 8) {
    showToast("New password must be at least 8 characters long.", "error");
    return;
  }

  const weak = passwordFailures(newPass);
  if (weak.length) {
    showToast("Password requirements: " + weak.join(", "), "error");
    return;
  }

  if (newPass !== confirm) {
    showToast("Passwords do not match.", "error");
    return;
  }

  // Update password in local state
  userAccount.password = await sha256(newPass);
  store.saveState();
  
  // Submit password change transaction to Mock Server
  const stateStr = localStorage.getItem("workforces_state");
  if (stateStr) {
    try {
      const state = JSON.parse(stateStr);
      const token = state.currentSession ? state.currentSession.token : null;
      if (token) {
        // Safe backend update
        const employee = store.getEmployee(empId);
        await MockServer.registerUser(employee, newPass, token);
      }
    } catch(err) { console.error(err); }
  }
  
  document.getElementById("profile-security-form").reset();
  showToast("Password updated successfully!", "success");
};

window.handleBankUpdate = function (e, empId) {
  e.preventDefault();
  const bankDetails = {
    wage: parseFloat(document.getElementById("salary-wage-input").value) || 0,
    bankName: document.getElementById("bank-name-input").value.trim(),
    accountNo: document.getElementById("bank-account-input").value.trim(),
    ifsc: document.getElementById("bank-ifsc-input").value.trim(),
    pan: document.getElementById("bank-pan-input").value.trim()
  };

  store.updateEmployee(empId, bankDetails);
  showToast("Banking information saved.", "success");
};

// ==========================================
// ATTENDANCE VIEW RENDERING
// ==========================================
let attendanceViewMode = "daily";

function attendanceRows(logs, admin) {
  return logs.map(log => {
    const emp = store.getEmployee(log.employeeId) || { name: "Unknown Employee" };
    const status = attendanceStatus(log);
    return `
      <tr>
        <td><strong>${text(log.date)}</strong></td>
        ${admin ? `<td style="font-family: var(--font-mono); font-size: 0.85rem;">${text(log.employeeId)}</td><td>${text(emp.name)}</td>` : ""}
        <td>${text(log.checkIn || "--:--")}</td>
        <td>${text(log.checkOut || "--:--")}</td>
        <td>${hours(log.workHours)}</td>
        <td>${hours(log.extraHours)}</td>
        <td>${statusBadge(status)}</td>
      </tr>
    `;
  }).join("");
}

function weeklyEmployeeRows(employees) {
  const dates = currentWeekDates();
  return employees.map(emp => {
    const logs = store.state.attendance.filter(log => log.employeeId === emp.id && dates.includes(log.date));
    const totalHours = logs.reduce((sum, log) => sum + (Number(log.workHours) || 0), 0);
    const presentDays = dates.filter(date => ["Present", "Half-day"].includes(employeeDayStatus(emp.id, date))).length;
    return `
      <tr>
        <td style="font-family: var(--font-mono); font-size: 0.85rem;">${text(emp.id)}</td>
        <td><strong>${text(emp.name)}</strong></td>
        ${dates.map(date => `<td>${statusBadge(employeeDayStatus(emp.id, date))}</td>`).join("")}
        <td><strong>${presentDays}</strong></td>
        <td>${totalHours.toFixed(2)} hrs</td>
      </tr>
    `;
  }).join("");
}

window.setAttendanceViewMode = function (mode) {
  attendanceViewMode = mode;
  renderAttendanceView();
};

window.renderAttendanceView = async function () {
  const user = store.getCurrentUser();
  const isAdmin = user.role === "HR";
  const employees = isAdmin ? store.state.employees : [user];
  const logs = isAdmin ? store.state.attendance : store.state.attendance.filter(l => l.employeeId === user.id);
  const weekDates = currentWeekDates();
  const modeButtons = `
    <div class="segmented-control">
      <button class="segment-btn ${attendanceViewMode === "daily" ? "active" : ""}" onclick="setAttendanceViewMode('daily')">Daily</button>
      <button class="segment-btn ${attendanceViewMode === "weekly" ? "active" : ""}" onclick="setAttendanceViewMode('weekly')">Weekly</button>
    </div>
  `;

  const dailyTable = `
    <div class="directory-actions animate-fade">
      <div class="search-filter-grp">
        ${isAdmin ? `<input class="input-ctrl" type="date" id="attendance-date-search" value="${getTodayString()}" onchange="filterAdminAttendance()"><input class="input-ctrl" type="text" id="attendance-emp-search" placeholder="Search by Employee ID or Name..." oninput="filterAdminAttendance()">` : ""}
      </div>
      ${modeButtons}
    </div>
    <div class="data-table-container glass animate-fade">
      <table class="data-table">
        <thead>
          <tr>
            <th>Date</th>
            ${isAdmin ? "<th>Employee ID</th><th>Employee Name</th>" : ""}
            <th>Check In</th>
            <th>Check Out</th>
            <th>Logged Hours</th>
            <th>Extra Hours</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody id="attendance-table-body">
          ${attendanceRows(logs, isAdmin) || `<tr><td colspan="${isAdmin ? 8 : 6}" style="text-align: center; color: var(--text-muted); padding: 32px;">No attendance logs recorded.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;

  const weeklyTable = `
    <div class="directory-actions animate-fade">
      <h4 style="font-weight: 600;">Week of ${text(weekDates[0])} to ${text(weekDates[6])}</h4>
      ${modeButtons}
    </div>
    <div class="data-table-container glass animate-fade">
      <table class="data-table weekly-attendance-table">
        <thead>
          <tr>
            <th>Employee ID</th>
            <th>Name</th>
            ${weekDates.map(date => `<th>${text(date.slice(5))}</th>`).join("")}
            <th>Tracked Days</th>
            <th>Total Hours</th>
          </tr>
        </thead>
        <tbody>${weeklyEmployeeRows(employees)}</tbody>
      </table>
    </div>
  `;

  window.renderApp(`
    ${getSidebarHTML("attendance")}
    <div class="main-wrapper">
      ${getHeaderHTML("Attendance logs")}
      <div class="view-container">
        ${attendanceViewMode === "weekly" ? weeklyTable : dailyTable}
      </div>
    </div>
  `);
};

window.filterAdminAttendance = function () {
  const dateEl = document.getElementById("attendance-date-search");
  const searchEl = document.getElementById("attendance-emp-search");
  const tbody = document.getElementById("attendance-table-body");
  if (!dateEl || !searchEl || !tbody) return;
  const dateVal = dateEl.value;
  const searchVal = searchEl.value.toLowerCase();
  
  const filtered = store.state.attendance.filter(log => {
    const emp = store.getEmployee(log.employeeId);
    const empName = emp ? emp.name.toLowerCase() : "";
    return (!dateVal || log.date === dateVal) && (!searchVal || log.employeeId.toLowerCase().includes(searchVal) || empName.includes(searchVal));
  });
  tbody.innerHTML = attendanceRows(filtered, true) || `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 32px;">No matching records found.</td></tr>`;
};

// ==========================================
// CALENDAR & LEAVE SELECTOR OVERRIDES
// ==========================================
let selectedLeaveRange = { start: "", end: "" };

window.renderCalendarDays = function (year, month) {
  const user = store.getCurrentUser();
  const days = [];
  const today = getTodayString();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDayOfWeek = new Date(year, month, 1).getDay();
  const monthStr = String(month + 1).padStart(2, "0");

  for (let i = 0; i < startDayOfWeek; i++) days.push(`<div class="calendar-day empty"></div>`);

  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = `${year}-${monthStr}-${String(day).padStart(2, "0")}`;
    const status = employeeDayStatus(user.id, dayStr);
    let dayClass = "";
    if (status === "Leave") dayClass = "leave-day";
    else if (status === "Present" || status === "Half-day") dayClass = "present-day";
    else if (status === "Absent" && dayStr < today) dayClass = "absent-day";
    const selected = selectedLeaveRange.start && dayStr >= selectedLeaveRange.start && dayStr <= (selectedLeaveRange.end || selectedLeaveRange.start);
    const boundary = dayStr === selectedLeaveRange.start || dayStr === selectedLeaveRange.end;
    
    days.push(`
      <div class="calendar-day ${dayClass} ${dayStr === today ? "today" : ""} ${selected ? "selected-range" : ""} ${boundary ? "selected-boundary" : ""}" onclick="selectLeaveDate('${dayStr}')" title="Select leave date">
        <span class="calendar-day-num">${day}</span>
        ${dayClass ? '<span class="calendar-day-marker"></span>' : ""}
      </div>
    `);
  }
  return days.join("");
};

window.selectLeaveDate = function (dayStr) {
  if (!selectedLeaveRange.start || (selectedLeaveRange.start && selectedLeaveRange.end)) {
    selectedLeaveRange = { start: dayStr, end: "" };
  } else if (dayStr < selectedLeaveRange.start) {
    selectedLeaveRange = { start: dayStr, end: selectedLeaveRange.start };
  } else {
    selectedLeaveRange.end = dayStr;
  }
  renderTimeOffView();
};

window.clearLeaveSelection = function () {
  selectedLeaveRange = { start: "", end: "" };
  renderTimeOffView();
};

const originalShowLeaveModal = showApplyLeaveModal;
window.showApplyLeaveModal = function () {
  originalShowLeaveModal();
  const start = document.getElementById("leave-start");
  const end = document.getElementById("leave-end");
  if (start && selectedLeaveRange.start) start.value = selectedLeaveRange.start;
  if (end && (selectedLeaveRange.end || selectedLeaveRange.start)) end.value = selectedLeaveRange.end || selectedLeaveRange.start;
  if (start && end) calculateRequestedDays();
};

const originalRenderTimeOff = renderTimeOffView;
window.renderTimeOffView = function () {
  originalRenderTimeOff();
  const user = store.getCurrentUser();
  if (!user || user.role === "HR") return;
  const calendarHeader = document.querySelector(".calendar-header");
  if (!calendarHeader || document.getElementById("leave-selection-actions")) return;
  calendarHeader.insertAdjacentHTML("afterend", `
    <div id="leave-selection-actions" class="leave-selection-actions animate-fade">
      <span>${selectedLeaveRange.start ? `Selected: ${text(selectedLeaveRange.start)}${selectedLeaveRange.end ? " to " + text(selectedLeaveRange.end) : ""}` : "Select dates on the calendar for a leave range."}</span>
      <button class="btn btn-secondary btn-sm" onclick="clearLeaveSelection()">Clear</button>
    </div>
  `);
};

// ==========================================
// PAYROLL CONTROL OVERRIDES
// ==========================================
const originalRenderPayroll = renderPayrollView;
window.renderPayrollView = function () {
  originalRenderPayroll();
  const user = store.getCurrentUser();
  if (!user || user.role !== "HR") return;
  document.querySelectorAll(".data-table tbody tr").forEach(row => {
    const empId = normalizeId(row.cells && row.cells[0] ? row.cells[0].textContent : "");
    if (!store.getEmployee(empId)) return;
    const actionCell = row.cells[row.cells.length - 1];
    if (!actionCell || actionCell.querySelector(".payroll-edit-btn")) return;
    actionCell.insertAdjacentHTML("beforeend", `<button class="btn btn-secondary btn-sm payroll-edit-btn" onclick="showPayrollEditModal('${attr(empId)}')">Edit Pay</button>`);
  });
};

window.showPayrollEditModal = function (empId) {
  const emp = store.getEmployee(empId);
  if (!emp) return;
  const body = `
    <form id="payroll-edit-form" onsubmit="submitPayrollEdit(event, '${attr(empId)}')">
      <div class="form-group">
        <label for="payroll-wage-input">Monthly Gross Wage (INR)</label>
        <input class="input-ctrl" type="number" id="payroll-wage-input" min="0" step="1" required value="${attr(emp.wage || 0)}">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="payroll-bank-input">Bank Name</label>
          <input class="input-ctrl" type="text" id="payroll-bank-input" required value="${attr(emp.bankName || "")}">
        </div>
        <div class="form-group">
          <label for="payroll-account-input">Account Number</label>
          <input class="input-ctrl" type="text" id="payroll-account-input" required value="${attr(emp.accountNo || "")}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="payroll-ifsc-input">IFSC Code</label>
          <input class="input-ctrl" type="text" id="payroll-ifsc-input" required value="${attr(emp.ifsc || "")}">
        </div>
        <div class="form-group">
          <label for="payroll-pan-input">PAN</label>
          <input class="input-ctrl" type="text" id="payroll-pan-input" required value="${attr(emp.pan || "")}">
        </div>
      </div>
      <div class="payroll-preview" id="payroll-preview"></div>
      <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px;">
        <button class="btn btn-secondary" type="button" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" type="submit">Save Payroll</button>
      </div>
    </form>
  `;
  showModal("Edit Payroll Control", body);
  document.getElementById("payroll-wage-input").addEventListener("input", updatePayrollPreview);
  updatePayrollPreview();
};

window.updatePayrollPreview = function () {
  const input = document.getElementById("payroll-wage-input");
  const preview = document.getElementById("payroll-preview");
  if (!input || !preview) return;
  const wage = Number(input.value) || 0;
  const calc = getSalaryBreakdown(wage);
  preview.innerHTML = `
    <div><span>Basic</span><strong>${money(calc.basic)}</strong></div>
    <div><span>HRA</span><strong>${money(calc.hra)}</strong></div>
    <div><span>Employee PF</span><strong>${money(calc.employeePf)}</strong></div>
    <div><span>Net Take-home</span><strong>${money(calc.netSalary)}</strong></div>
  `;
};

window.submitPayrollEdit = function (event, empId) {
  event.preventDefault();
  store.updateEmployee(empId, {
    wage: Number(document.getElementById("payroll-wage-input").value) || 0,
    bankName: document.getElementById("payroll-bank-input").value.trim(),
    accountNo: document.getElementById("payroll-account-input").value.trim(),
    ifsc: document.getElementById("payroll-ifsc-input").value.trim().toUpperCase(),
    pan: document.getElementById("payroll-pan-input").value.trim().toUpperCase()
  });
  closeModal();
  renderPayrollView();
  showToast("Payroll information updated.", "success");
};

// safe onboard controls
const originalShowOnboard = showOnboardModal;
window.showOnboardModal = function () {
  originalShowOnboard();
  const pass = document.getElementById("new-pass");
  if (pass) {
    pass.type = "password";
    pass.placeholder = "8+ chars, mixed case, number, symbol";
  }
};

const originalOnboardSubmit = window.handleOnboardSubmit;
window.handleOnboardSubmit = function (event) {
  const password = document.getElementById("new-pass")?.value || "";
  const failures = passwordFailures(password);
  if (failures.length) {
    event.preventDefault();
    showToast("Temporary password requirements: " + failures.join(", "), "error");
    return;
  }
  if (originalOnboardSubmit) originalOnboardSubmit(event);
  showToast("Employee onboarded successfully.", "success");
};

// avatar resolution
function avatarFor(person, bg, fg) {
  if (person) {
    const av = person.avatar || "";
    let key = "";
    if (av.startsWith("db-ref:")) {
      key = av.replace("db-ref:", "");
    } else if (av.startsWith("avatar-")) {
      key = av;
    } else if (av.startsWith("data:image/")) {
      return av;
    }

    if (key) {
      if (avatarCache[key]) return avatarCache[key];
      
      getLocalFile(key, (data) => {
        if (data) {
          const url = (data instanceof Blob) ? URL.createObjectURL(data) : data;
          avatarCache[key] = url;
          document.querySelectorAll(`img[data-avatar-id="${person.id}"]`).forEach(img => {
            img.src = url;
          });
        }
      });
      return getPlaceholderSvg(person, bg, fg);
    }
  }
  return getPlaceholderSvg(person, bg, fg);
}

function getPlaceholderSvg(person, bg, fg) {
  const safeInitials = text(initials(person && person.name));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="50" fill="${bg}"/><text x="50" y="55" font-family="Arial, sans-serif" font-size="32" font-weight="700" fill="${fg}" text-anchor="middle" dominant-baseline="middle">${safeInitials}</text></svg>`;
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
}

window.handleAvatarChange = function (event, empId) {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showToast("Profile picture must be an image file.", "error");
    event.target.value = "";
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    showToast("Profile picture must be under 2 MB.", "error");
    event.target.value = "";
    return;
  }
  
  const avatarId = "avatar-" + empId;
  saveLocalFile(avatarId, file, () => {
    const url = URL.createObjectURL(file);
    avatarCache[avatarId] = url;
    
    const emp = store.getEmployee(empId);
    if (emp) {
      emp.avatar = "db-ref:" + avatarId;
      store.saveState();
      
      // Update visual references
      const headerAvatar = document.querySelector(".top-header .user-avatar");
      if (headerAvatar && store.getCurrentUser()?.id === empId) {
        headerAvatar.src = url;
      }
      
      // Sync avatar file payload to Server Document store
      const stateStr = localStorage.getItem("workforces_state");
      if (stateStr) {
        try {
          const state = JSON.parse(stateStr);
          const token = state.currentSession ? state.currentSession.token : null;
          if (token) {
            MockServer.saveDocument(token, avatarId, file);
          }
        } catch(e) {}
      }
      
      SyncEngine.enqueue("UPDATE", "employees", emp);
    }
    showToast("Profile avatar saved.", "success");
    renderProfileView({ id: empId });
  });
};

// ==========================================
// SYSTEM BOOTSTRAP ORCHESTRATION
// ==========================================
initDOMRenderer();

// Initialize Mock Engine Components
initClientDB(() => {
  MockServer.init().then(() => {
    MockEmailService.init();
    SyncEngine.init();
    
    // Bind Sync Engine state notifications to the header sync badge UI
    SyncEngine.onStatusChange((status, count) => {
      updateSyncBadgeUI(status, count);
    });
    
    hookRouter();
    if (typeof router !== "undefined") {
      router.handleRoute();
    }
  }).catch(err => {
    console.error("[BOOTSTRAP] Secure server initialization failed:", err);
  });
});
