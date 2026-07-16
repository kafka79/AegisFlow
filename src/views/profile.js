import {
  getTodayString, getNowTimeString, parseTimeToMs, calculateDaysBetween,
  validateIdFormat, generateEmployeeId, logAudit, getAuditLog,
  calculateProfessionalTax, calculateTDS, getSalaryBreakdown, isHoliday, NATIONAL_HOLIDAYS
} from "../helpers.js";
import { escapeHtml } from "../renderer.js";
import { getStore, getRouter } from "../app-context.js";
import { ICONS, getSidebarHTML, getHeaderHTML, showModal, closeModal } from "./layout.js";
import { showInlineAlert, selectedCalendarDate } from "./shared.js";
import { SyncEngine } from "../sync.js";
export { selectedCalendarDate } from "./shared.js";

export function renderProfileView({ id }) {
  const user = getStore().getCurrentUser();
  const emp = getStore().getEmployee(id);
  if (!emp) {
    getRouter().navigate("dashboard");
    return;
  }

  const sidebarHTML = getSidebarHTML("employees");
  const headerHTML = getHeaderHTML("Employee Profile");

  const isAdmin = user.role === "HR";
  const isSelf = user.id === emp.id;

  const initials = emp.name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
  const avatarSrc = emp.avatar || window.getCachedAvatar?.(emp.id, initials) || `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="50" fill="%231f2937"/><text x="50" y="55" font-family="'Outfit', sans-serif" font-size="32" font-weight="700" fill="%236366f1" text-anchor="middle" dominant-baseline="middle">${initials}</text></svg>`;

  window.renderApp(`
    ${sidebarHTML}
    <div class="main-wrapper" data-layout="main">
      ${headerHTML}
      <div class="view-container">
        <div class="profile-layout animate-fade">
          <!-- Profile Card -->
          <div class="profile-sidebar glass">
            <div class="profile-avatar-wrapper" data-wf-click="triggerAvatarUpload('${emp.id}')" style="cursor: ${(isAdmin || isSelf) ? 'pointer' : 'default'};">
              <img id="profile-avatar-img" class="profile-page-avatar" src="${avatarSrc}" alt="Avatar">
              ${(isAdmin || isSelf) ? '<div class="avatar-overlay">Change</div>' : ''}
              <input type="file" id="avatar-input" style="display: none;" onchange="handleAvatarChange(event, '${emp.id}')" accept="image/*">
            </div>
            <h3 class="profile-name">${emp.name}</h3>
            <span class="profile-role-badge">${emp.role === 'HR' ? 'HR Manager' : emp.role}</span>
            <div style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-muted); margin-bottom: 24px;">ID: ${emp.id}</div>
          </div>

          <!-- Profile Details Panel -->
          <div class="profile-main-panel">
            <div class="tab-btn-group">
              <button class="tab-btn active" onclick="switchProfileTab(event, 'general-info')">General Details</button>
              <button class="tab-btn" onclick="switchProfileTab(event, 'salary-info')">Compensation & Bank</button>
              ${isSelf ? '<button class="tab-btn" onclick="switchProfileTab(event, ' + "'security-info'" + ')">Security</button>' : ''}
            </div>

            <!-- Tab 1: General Info -->
            <div id="general-info" class="tab-content active glass" style="padding: 32px;">
              <h4 style="margin-bottom: 24px; font-weight: 600; color: var(--accent);">Corporate Specifications</h4>
              <form id="profile-form" onsubmit="handleProfileUpdate(event, '${emp.id}')">
                <div class="form-row">
                  <div class="form-group">
                    <label>Login ID</label>
                    <input class="input-ctrl" type="text" value="${emp.id}" readonly>
                  </div>
                  <div class="form-group">
                    <label>Corporate Email</label>
                    <input class="input-ctrl" type="email" id="profile-email" value="${emp.email}" ${isAdmin ? '' : 'readonly'}>
                  </div>
                </div>

                <div class="form-row">
                  <div class="form-group">
                    <label>Primary Role</label>
                    <input class="input-ctrl" type="text" id="profile-role" value="${emp.role}" ${isAdmin ? '' : 'readonly'}>
                  </div>
                  <div class="form-group">
                    <label>Department</label>
                    <input class="input-ctrl" type="text" id="profile-dept" value="${emp.department}" ${isAdmin ? '' : 'readonly'}>
                  </div>
                </div>

                <div class="form-row">
                  <div class="form-group">
                    <label>Reporting Manager</label>
                    <input class="input-ctrl" type="text" id="profile-manager" value="${emp.manager}" ${isAdmin ? '' : 'readonly'}>
                  </div>
                  <div class="form-group">
                    <label>Work Location</label>
                    <input class="input-ctrl" type="text" id="profile-location" value="${emp.location}" ${isAdmin ? '' : 'readonly'}>
                  </div>
                </div>

                <h4 style="margin-top: 32px; margin-bottom: 20px; font-weight: 600; color: var(--accent);">Personal Specifications</h4>
                
                <div class="form-row">
                  <div class="form-group">
                    <label>Mobile Contact</label>
                    <input class="input-ctrl" type="text" id="profile-phone" value="${emp.phone}" ${(isAdmin || isSelf) ? '' : 'readonly'}>
                  </div>
                  <div class="form-group">
                    <label>Personal Email</label>
                    <input class="input-ctrl" type="email" id="profile-pemail" value="${emp.personalEmail || ''}" ${(isAdmin || isSelf) ? '' : 'readonly'}>
                  </div>
                </div>

                <div class="form-row">
                  <div class="form-group">
                    <label>Date of Birth</label>
                    <input class="input-ctrl" type="date" id="profile-dob" value="${emp.dob || ''}" ${(isAdmin || isSelf) ? '' : 'readonly'}>
                  </div>
                  <div class="form-group">
                    <label>Gender</label>
                    <select class="input-ctrl" id="profile-gender" ${(isAdmin || isSelf) ? '' : 'disabled'}>
                      <option value="Male" ${emp.gender === 'Male' ? 'selected' : ''}>Male</option>
                      <option value="Female" ${emp.gender === 'Female' ? 'selected' : ''}>Female</option>
                      <option value="Other" ${emp.gender === 'Other' ? 'selected' : ''}>Other</option>
                    </select>
                  </div>
                </div>

                <div class="form-row">
                  <div class="form-group">
                    <label>Nationality</label>
                    <input class="input-ctrl" type="text" id="profile-nation" value="${emp.nationality || 'Indian'}" ${(isAdmin || isSelf) ? '' : 'readonly'}>
                  </div>
                  <div class="form-group">
                    <label>Marital Status</label>
                    <select class="input-ctrl" id="profile-marital" ${(isAdmin || isSelf) ? '' : 'disabled'}>
                      <option value="Single" ${emp.maritalStatus === 'Single' ? 'selected' : ''}>Single</option>
                      <option value="Married" ${emp.maritalStatus === 'Married' ? 'selected' : ''}>Married</option>
                      <option value="Divorced" ${emp.maritalStatus === 'Divorced' ? 'selected' : ''}>Divorced</option>
                    </select>
                  </div>
                </div>

                <div class="form-row">
                  <div class="form-group">
                    <label>UAN (Universal Account Number)</label>
                    <input class="input-ctrl" type="text" id="profile-uan" placeholder="12-digit EPF UAN" value="${emp.uan || ''}" ${(isAdmin || isSelf) ? '' : 'readonly'}>
                  </div>
                  <div class="form-group">
                    <label>ESIC Number</label>
                    <input class="input-ctrl" type="text" id="profile-esic" placeholder="17-digit ESIC ID" value="${emp.esic || ''}" ${(isAdmin || isSelf) ? '' : 'readonly'}>
                  </div>
                </div>

                <div class="form-group">
                  <label>Mailing Address</label>
                  <input class="input-ctrl" type="text" id="profile-address" value="${emp.address || ''}" ${(isAdmin || isSelf) ? '' : 'readonly'}>
                </div>

                ${(isAdmin || isSelf) ? `
                  <div style="display: flex; justify-content: flex-end; margin-top: 24px;">
                    <button class="btn btn-primary" type="submit">Save Profile Changes</button>
                  </div>
                ` : ""}
              </form>
            </div>

            <!-- Tab 2: Salary Structure Calculations -->
            <div id="salary-info" class="tab-content glass" style="padding: 32px;">
              <h4 style="margin-bottom: 24px; font-weight: 600; color: var(--accent);">Salary Component breakdown</h4>
              
              <div class="form-row" style="margin-bottom: 24px;">
                <div class="form-group">
                  <label>Monthly Gross Wage (INR)</label>
                  <input class="input-ctrl" type="number" id="salary-wage-input" value="${emp.wage || 0}" ${isAdmin ? '' : 'readonly'} oninput="recalculateSalaryDisplay()">
                </div>
                <div class="form-group">
                  <label>Schedule Work Time</label>
                  <input class="input-ctrl" type="text" value="8 Hours/day (5 days a week)" readonly>
                </div>
              </div>

              <div class="salary-breakdown-box" id="salary-breakdown-box-view">
                <!-- Dynamic salary components are rendered here -->
              </div>

              <h4 style="margin-top: 32px; margin-bottom: 20px; font-weight: 600; color: var(--accent);">Bank Verification Fields</h4>
              <form id="profile-bank-form" onsubmit="handleBankUpdate(event, '${emp.id}')">
                <div class="form-row">
                  <div class="form-group">
                    <label>Bank Name</label>
                    <input class="input-ctrl" type="text" id="bank-name-input" value="${emp.bankName || ''}" ${isAdmin ? '' : 'readonly'}>
                  </div>
                  <div class="form-group">
                    <label>Account Number</label>
                    <input class="input-ctrl" type="text" id="bank-account-input" value="${emp.accountNo || ''}" ${isAdmin ? '' : 'readonly'}>
                  </div>
                </div>

                <div class="form-row">
                  <div class="form-group">
                    <label>IFSC Code</label>
                    <input class="input-ctrl" type="text" id="bank-ifsc-input" value="${emp.ifsc || ''}" ${isAdmin ? '' : 'readonly'}>
                  </div>
                  <div class="form-group">
                    <label>PAN Card Details</label>
                    <input class="input-ctrl" type="text" id="bank-pan-input" value="${emp.pan || ''}" ${isAdmin ? '' : 'readonly'}>
                  </div>
                </div>

                ${isAdmin ? `
                  <div style="display: flex; justify-content: flex-end; margin-top: 24px;">
                    <button class="btn btn-primary" type="submit">Update Compensation & Banking</button>
                  </div>
                ` : ""}
              </form>
            </div>

            <!-- Tab 3: Security & Credentials Changes -->
            <div id="security-info" class="tab-content glass" style="padding: 32px;">
              <h4 style="margin-bottom: 20px; font-weight: 600; color: var(--accent);">Change System Login Password</h4>
              <form id="profile-security-form" onsubmit="handlePasswordUpdate(event, '${emp.id}')">
                <div class="form-group">
                  <label for="current-password">Current Password</label>
                  <input class="input-ctrl" type="password" id="current-password" required placeholder="Enter current login password">
                </div>
                
                <div class="form-group">
                  <label for="new-password">New Password</label>
                  <input class="input-ctrl" type="password" id="new-password-input" required placeholder="Min 6 characters">
                </div>

                <div class="form-group">
                  <label for="confirm-new-password">Confirm New Password</label>
                  <input class="input-ctrl" type="password" id="confirm-password-input" required placeholder="Confirm new password">
                </div>

                <div style="display: flex; justify-content: flex-end; margin-top: 24px;">
                  <button class="btn btn-primary" type="submit">Update Password Credentials</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  `);

  recalculateSalaryDisplay();
}

export function switchProfileTab(e, tabId) {
  const tabs = e.target.parentElement.querySelectorAll(".tab-btn");
  tabs.forEach(btn => btn.classList.remove("active"));
  
  const contents = e.target.parentElement.parentElement.querySelectorAll(".tab-content");
  contents.forEach(cnt => cnt.classList.remove("active"));
  
  e.target.classList.add("active");
  const contentEl = document.getElementById(tabId);
  if (contentEl) contentEl.classList.add("active");
}

export function triggerAvatarUpload(empId) {
  const user = getStore().getCurrentUser();
  if (user.role === "HR" || user.id === empId) {
    const input = document.getElementById("avatar-input");
    if (input) input.click();
  }
}

export function handleAvatarChange(e, empId) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    const base64 = evt.target.result;
    getStore().updateEmployee(empId, { avatar: base64 });
    const img = document.getElementById("profile-avatar-img");
    if (img) img.src = base64;
  };
  reader.readAsDataURL(file);
}

export function handleProfileUpdate(e, empId) {
  e.preventDefault();
  
  const updated = {
    name: getStore().getEmployee(empId).name,
    phone: document.getElementById("profile-phone").value.trim(),
    personalEmail: document.getElementById("profile-pemail").value.trim(),
    dob: document.getElementById("profile-dob").value,
    gender: document.getElementById("profile-gender").value,
    maritalStatus: document.getElementById("profile-marital").value,
    address: document.getElementById("profile-address").value.trim(),
    nationality: document.getElementById("profile-nation").value.trim(),
    uan: document.getElementById("profile-uan").value.trim(),
    esic: document.getElementById("profile-esic").value.trim()
  };

  const user = getStore().getCurrentUser();
  if (user.role === "HR") {
    updated.email = document.getElementById("profile-email").value.trim();
    updated.role = document.getElementById("profile-role").value.trim();
    updated.department = document.getElementById("profile-dept").value.trim();
    updated.manager = document.getElementById("profile-manager").value.trim();
    updated.location = document.getElementById("profile-location").value.trim();
  }

  getStore().updateEmployee(empId, updated);
  alert("Employee Profile updated successfully!");
}

export function recalculateSalaryDisplay() {
  const wageInput = document.getElementById("salary-wage-input");
  if (!wageInput) return;
  
  const wage = parseFloat(wageInput.value) || 0;
  const locationInput = document.getElementById("profile-location") || document.getElementById("new-location");
  const location = locationInput ? locationInput.value : "";
  const calc = getSalaryBreakdown(wage, { location });

  const breakdownBox = document.getElementById("salary-breakdown-box-view");
  if (breakdownBox) {
    breakdownBox.innerHTML = `
      <div class="salary-group">
        <div class="salary-group-title">Earnings Breakdown</div>
        <div class="salary-row">
          <span class="salary-label">Basic Salary (50% base)</span>
          <span class="salary-val">₹${calc.basic}</span>
        </div>
        <div class="salary-row">
          <span class="salary-label">HRA Allowance (40% Basic)</span>
          <span class="salary-val">₹${calc.hra}</span>
        </div>
        <div class="salary-row">
          <span class="salary-label">Standard Allowance (10% Wage)</span>
          <span class="salary-val">₹${calc.standard}</span>
        </div>
        <div class="salary-row">
          <span class="salary-label">Performance Bonus (15% Basic)</span>
          <span class="salary-val">₹${calc.bonus}</span>
        </div>
        <div class="salary-row">
          <span class="salary-label">LTA Allowance (8.33% Basic)</span>
          <span class="salary-val">₹${calc.lta}</span>
        </div>
        <div class="salary-row" style="border-top: 1px solid var(--border-light); font-weight: 700;">
          <span class="salary-label" style="color: var(--text-main);">Fixed Allowance (Remainder)</span>
          <span class="salary-val">₹${calc.fixed}</span>
        </div>
      </div>

      <div class="salary-group">
        <div class="salary-group-title">Contributions & Deductions</div>
        <div class="salary-row">
          <span class="salary-label">Employer PF Contribution (12%)</span>
          <span class="salary-val">₹${calc.employerPf}</span>
        </div>
        <div class="salary-row">
          <span class="salary-label">Employee PF Deduction (12%)</span>
          <span class="salary-val deduct">₹${calc.employeePf}</span>
        </div>
        <div class="salary-row">
          <span class="salary-label">Professional Tax (PT)</span>
          <span class="salary-val deduct">₹${calc.pt}</span>
        </div>
        <div class="salary-row" style="border-top: 1px solid var(--border-light); font-weight: 700; margin-top: 24px;">
          <span class="salary-label" style="color: var(--text-main);">Net Monthly Take-Home</span>
          <span class="salary-val highlight">₹${calc.netSalary}</span>
        </div>
      </div>
    `;
  }
}

export function handleBankUpdate(e, empId) {
  e.preventDefault();
  
  const wageInput = document.getElementById("salary-wage-input");
  const wage = parseFloat(wageInput.value) || 0;
  
  const bankDetails = {
    wage: wage,
    bankName: document.getElementById("bank-name-input").value.trim(),
    accountNo: document.getElementById("bank-account-input").value.trim(),
    ifsc: document.getElementById("bank-ifsc-input").value.trim(),
    pan: document.getElementById("bank-pan-input").value.trim()
  };

  getStore().updateEmployee(empId, bankDetails);
  alert("Banking & Compensation criteria updated!");
}

export async function handlePasswordUpdate(e, empId) {
  e.preventDefault();
  const current = document.getElementById("current-password").value;
  const newPass = document.getElementById("new-password-input").value;
  const confirm = document.getElementById("confirm-password-input").value;

  const userAccount = getStore().state.users.find(u => u.employeeId === empId);
  const currentHash = await window.sha256?.(current) || current; // fallback if sha256 not bound yet
  
  if (userAccount.password !== currentHash) {
    alert("The current password entered is incorrect!");
    return;
  }

  if (newPass.length < 6) {
    alert("New password must be at least 6 characters long.");
    return;
  }

  if (newPass !== confirm) {
    alert("Confirm password does not match the new password.");
    return;
  }

  userAccount.password = await window.sha256?.(newPass) || newPass;
  SyncEngine.enqueue("UPDATE", "users", userAccount);
  getStore().saveState();
  
  document.getElementById("profile-security-form").reset();
  alert("Credentials security profile updated successfully!");
}
