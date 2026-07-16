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

export function renderEmployeesView() {
  const user = getStore().getCurrentUser();
  const sidebarHTML = getSidebarHTML("employees");
  const headerHTML = getHeaderHTML("Employee Directory");
  
  const isAdmin = user.role === "HR";
  const employees = getStore().state.employees;

  window.renderApp(`
    ${sidebarHTML}
    <div class="main-wrapper" data-layout="main">
      ${headerHTML}
      <div class="view-container">
        <div class="directory-actions animate-fade">
          <div class="search-filter-grp">
            <input class="input-ctrl" type="text" id="employee-search" oninput="filterEmployees()" placeholder="Search employee name, department, ID...">
            <select class="input-ctrl" id="employee-filter-status" onchange="filterEmployees()" style="width: 160px;">
              <option value="all">All Statuses</option>
              <option value="Present">Present</option>
              <option value="Leave">On Leave</option>
              <option value="Absent">Absent</option>
            </select>
          </div>
          ${isAdmin ? `<button class="btn btn-primary" data-wf-click="showOnboardModal()">${ICONS.plus} Add Employee</button>` : ""}
        </div>

        <div class="employee-grid animate-fade" id="employee-grid-container">
          ${employees.map(emp => getEmployeeCardHTML(emp)).join("")}
        </div>
      </div>
    </div>
  `);
}

export function getEmployeeCardHTML(emp) {
  const initials = emp.name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
  const avatarSrc = emp.avatar || window.getCachedAvatar?.(emp.id, initials) || `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="50" fill="%231f2937"/><text x="50" y="55" font-family="'Outfit', sans-serif" font-size="32" font-weight="700" fill="%236366f1" text-anchor="middle" dominant-baseline="middle">${initials}</text></svg>`;
  
  let statusClass = "absent";
  const todayStr = getTodayString();
  const onLeave = getStore().state.timeOff.some(l => 
    l.employeeId === emp.id && 
    l.status === "Approved" && 
    todayStr >= l.startDate && 
    todayStr <= l.endDate
  );
  
  if (onLeave) {
    statusClass = "leave";
  } else {
    const hasCheckedIn = getStore().state.attendance.some(a => a.employeeId === emp.id && a.date === todayStr);
    if (hasCheckedIn) {
      statusClass = "present";
    }
  }

  return `
    <div class="employee-card glass glow-accent" data-nav-route="profile" data-nav-params='${JSON.stringify({ id: emp.id })}' role="link" tabindex="0">
      <span class="card-status-dot ${statusClass}"></span>
      <img class="card-avatar" src="${avatarSrc}" alt="Avatar">
      <h4 class="card-name">${emp.name}</h4>
      <span class="card-role">${emp.role === 'HR' ? 'HR Manager' : emp.role}</span>
      <span style="font-size: 0.8rem; color: var(--text-muted);">${emp.department}</span>
      <span class="card-id">${emp.id}</span>
    </div>
  `;
}

export function filterEmployees() {
  const query = document.getElementById("employee-search").value.toLowerCase();
  const statusFilter = document.getElementById("employee-filter-status").value;
  const grid = document.getElementById("employee-grid-container");
  if (!grid) return;

  const todayStr = getTodayString();
  const filtered = getStore().state.employees.filter(emp => {
    let status = "Absent";
    const onLeave = getStore().state.timeOff.some(l => 
      l.employeeId === emp.id && 
      l.status === "Approved" && 
      todayStr >= l.startDate && 
      todayStr <= l.endDate
    );
    if (onLeave) {
      status = "Leave";
    } else {
      const checkedIn = getStore().state.attendance.some(a => a.employeeId === emp.id && a.date === todayStr);
      if (checkedIn) status = "Present";
    }

    const matchesSearch = emp.name.toLowerCase().includes(query) || 
                          emp.id.toLowerCase().includes(query) || 
                          emp.department.toLowerCase().includes(query) ||
                          emp.role.toLowerCase().includes(query);
                          
    const matchesStatus = statusFilter === "all" || status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  grid.innerHTML = filtered.map(emp => getEmployeeCardHTML(emp)).join("");
}

export function showOnboardModal() {
  const formHTML = `
    <form id="onboard-form" onsubmit="handleOnboardSubmit(event)">
      <div class="form-group">
        <label for="new-name">Full Name</label>
        <input class="input-ctrl" type="text" id="new-name" required placeholder="e.g. Jane Doe">
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="new-email">Corporate Email</label>
          <input class="input-ctrl" type="email" id="new-email" required placeholder="jane.doe@odoo.com">
        </div>
        <div class="form-group">
          <label for="new-phone">Mobile Phone</label>
          <input class="input-ctrl" type="text" id="new-phone" required placeholder="+91 XXXXX XXXXX">
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="new-role">Role</label>
          <select class="input-ctrl" id="new-role" required>
            <option value="Employee">Employee</option>
            <option value="HR">HR Officer / Admin</option>
          </select>
        </div>
        <div class="form-group">
          <label for="new-dept">Department</label>
          <input class="input-ctrl" type="text" id="new-dept" required placeholder="e.g. Engineering">
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="new-manager">Reporting Manager</label>
          <input class="input-ctrl" type="text" id="new-manager" required placeholder="Manager Name">
        </div>
        <div class="form-group">
          <label for="new-location">Work Location</label>
          <input class="input-ctrl" type="text" id="new-location" required placeholder="e.g. Bangalore Campus">
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="new-doj">Date of Joining</label>
          <input class="input-ctrl" type="date" id="new-doj" required value="${getTodayString()}">
        </div>
        <div class="form-group">
          <label for="new-wage">Monthly Base Wage (INR)</label>
          <input class="input-ctrl" type="number" id="new-wage" required placeholder="e.g. 75000">
        </div>
      </div>

      <div class="form-group">
        <label for="new-pass">Temporary Login Password</label>
        <input class="input-ctrl" type="text" id="new-pass" required placeholder="Set temporary login password">
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px;">
        <button class="btn btn-secondary" type="button" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" type="submit">Onboard & Create ID</button>
      </div>
    </form>
  `;

  showModal("Onboard New Employee", formHTML);
}

export async function handleOnboardSubmit(e) {
  e.preventDefault();
  
  const newEmp = {
    id: "",
    name: document.getElementById("new-name").value.trim(),
    email: document.getElementById("new-email").value.trim(),
    phone: document.getElementById("new-phone").value.trim(),
    role: document.getElementById("new-role").value,
    department: document.getElementById("new-dept").value.trim(),
    manager: document.getElementById("new-manager").value.trim(),
    location: document.getElementById("new-location").value.trim(),
    dateOfJoining: document.getElementById("new-doj").value,
    wage: parseFloat(document.getElementById("new-wage").value),
    dob: "1995-01-01",
    address: "Provide address",
    nationality: "Indian",
    gender: "Male",
    maritalStatus: "Single",
    bankName: "TBD",
    accountNo: "TBD",
    ifsc: "TBD",
    pan: "TBD",
    uan: "",
    esic: "",
    avatar: ""
  };

  const pass = document.getElementById("new-pass").value;

  const added = await getStore().addEmployee(newEmp, pass);
  closeModal();
  
  if (window.location.hash.substring(1) === "employees") {
    renderEmployeesView();
  } else {
    getRouter().navigate("employees");
  }

  alert(`Employee Successfully Created!\nGenerated Login ID: ${added.id}`);
}
