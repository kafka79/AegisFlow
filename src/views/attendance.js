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

export function renderAttendanceView() {
  const user = getStore().getCurrentUser();
  const sidebarHTML = getSidebarHTML("attendance");
  const headerHTML = getHeaderHTML("Attendance logs");

  const isAdmin = user.role === "HR";
  let attendanceContent = "";

  if (isAdmin) {
    const logs = getStore().state.attendance;
    
    attendanceContent = `
      <div class="animate-fade">
        <div class="directory-actions">
          <div class="search-filter-grp">
            <input class="input-ctrl" type="date" id="attendance-date-search" value="${getTodayString()}" onchange="filterAdminAttendance()">
            <input class="input-ctrl" type="text" id="attendance-emp-search" placeholder="Search by Employee ID or Name..." oninput="filterAdminAttendance()">
          </div>
        </div>

        <div class="data-table-container glass">
          <table class="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Employee ID</th>
                <th>Employee Name</th>
                <th>Check In</th>
                <th>Check Out</th>
                <th>Logged Hours</th>
                <th>Extra Hours</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody id="attendance-table-body">
              ${logs.map(log => {
                const emp = getStore().getEmployee(log.employeeId);
                const empName = emp ? emp.name : "Unknown Employee";
                return `
                  <tr>
                    <td><strong>${log.date}</strong></td>
                    <td style="font-family: var(--font-mono); font-size: 0.85rem;">${log.employeeId}</td>
                    <td>${empName}</td>
                    <td>${log.checkIn || '--:--'}</td>
                    <td>${log.checkOut || '--:--'}</td>
                    <td>${log.workHours ? `${log.workHours} hrs` : '--:--'}</td>
                    <td>${log.extraHours ? `${log.extraHours} hrs` : '--:--'}</td>
                    <td><span class="status-badge approved">${log.status}</span></td>
                  </tr>
                `;
              }).join("") || `
                <tr>
                  <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 32px;">
                    No logs have been recorded in this space.
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } else {
    const logs = getStore().state.attendance.filter(a => a.employeeId === user.id);
    
    attendanceContent = `
      <div class="animate-fade">
        <h4 style="margin-bottom: 16px; font-weight: 600;">Your Check-in / Out logs</h4>
        <div class="data-table-container glass">
          <table class="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Check In</th>
                <th>Check Out</th>
                <th>Work Hours</th>
                <th>Extra Overtime</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${logs.map(log => `
                <tr>
                  <td><strong>${log.date}</strong></td>
                  <td>${log.checkIn || '--:--'}</td>
                  <td>${log.checkOut || '--:--'}</td>
                  <td>${log.workHours ? `${log.workHours} hrs` : '--:--'}</td>
                  <td>${log.extraHours ? `${log.extraHours} hrs` : '--:--'}</td>
                  <td><span class="status-badge approved">${log.status}</span></td>
                </tr>
              `).join("") || `
                <tr>
                  <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 32px;">
                    You have not recorded any attendance logs yet. Use the clock on the Dashboard page!
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  window.renderApp(`
    ${sidebarHTML}
    <div class="main-wrapper" data-layout="main">
      ${headerHTML}
      <div class="view-container">
        ${attendanceContent}
      </div>
    </div>
  `);
}

export function filterAdminAttendance() {
  const dateVal = document.getElementById("attendance-date-search").value;
  const searchVal = document.getElementById("attendance-emp-search").value.toLowerCase();
  const tbody = document.getElementById("attendance-table-body");
  if (!tbody) return;

  const filtered = getStore().state.attendance.filter(log => {
    const emp = getStore().getEmployee(log.employeeId);
    const empName = emp ? emp.name.toLowerCase() : "";
    
    const dateMatch = !dateVal || log.date === dateVal;
    const searchMatch = !searchVal || 
                        log.employeeId.toLowerCase().includes(searchVal) || 
                        empName.includes(searchVal);

    return dateMatch && searchMatch;
  });

  tbody.innerHTML = filtered.map(log => {
    const emp = getStore().getEmployee(log.employeeId);
    const empName = emp ? emp.name : "Unknown Employee";
    return `
      <tr>
        <td><strong>${log.date}</strong></td>
        <td style="font-family: var(--font-mono); font-size: 0.85rem;">${log.employeeId}</td>
        <td>${empName}</td>
        <td>${log.checkIn || '--:--'}</td>
        <td>${log.checkOut || '--:--'}</td>
        <td>${log.workHours ? `${log.workHours} hrs` : '--:--'}</td>
        <td>${log.extraHours ? `${log.extraHours} hrs` : '--:--'}</td>
        <td><span class="status-badge approved">${log.status}</span></td>
      </tr>
    `;
  }).join("") || `
    <tr>
      <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 32px;">
        No matching attendance records found.
      </td>
    </tr>
  `;
}
