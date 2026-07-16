import {
  getTodayString, getNowTimeString, parseTimeToMs, calculateDaysBetween,
  validateIdFormat, generateEmployeeId, logAudit, getAuditLog,
  calculateProfessionalTax, calculateTDS, getSalaryBreakdown, isHoliday, NATIONAL_HOLIDAYS, html
} from "../helpers.js";
import { escapeHtml } from "../renderer.js";
import { getStore, getRouter } from "../app-context.js";
import { ICONS, getSidebarHTML, getHeaderHTML, showModal, closeModal } from "./layout.js";
import { showInlineAlert, selectedCalendarDate } from "./shared.js";
export { selectedCalendarDate } from "./shared.js";

export function renderDashboardView() {
  const user = getStore().getCurrentUser();
  const sidebarHTML = getSidebarHTML("dashboard");
  const headerHTML = getHeaderHTML("Dashboard");
  
  let dashboardContent = "";

  if (user.role === "HR") {
    const totalEmployees = getStore().state.employees.length;
    let presentCount = 0;
    let leaveCount = 0;
    let absentCount = 0;
    
    const todayStr = getTodayString();
    getStore().state.employees.forEach(emp => {
      const onLeave = getStore().state.timeOff.some(l => 
        l.employeeId === emp.id && 
        l.status === "Approved" && 
        todayStr >= l.startDate && 
        todayStr <= l.endDate
      );
      
      if (onLeave) {
        leaveCount++;
      } else {
        const hasCheckedIn = getStore().state.attendance.some(a => a.employeeId === emp.id && a.date === todayStr);
        if (hasCheckedIn) {
          presentCount++;
        } else {
          absentCount++;
        }
      }
    });

    const pendingLeaves = getStore().state.timeOff.filter(l => l.status === "Pending").length;

    dashboardContent = html`
      <div class="dashboard-grid animate-fade">
        <div class="quick-info-panel" style="grid-column: span 12; grid-template-columns: repeat(4, 1fr);">
          <div class="info-card glass glow-accent">
            <div class="info-card-header">
              <span>Total Force</span>
              ${{ __htmlSafe: true, value: ICONS.employees }}
            </div>
            <div class="info-card-val">${totalEmployees}</div>
            <div class="info-card-footer">Registered workforce accounts</div>
          </div>
          <div class="info-card glass" style="border-left: 4px solid var(--status-present);">
            <div class="info-card-header">
              <span>Present Today</span>
              <span class="card-status-dot present" style="position: static;"></span>
            </div>
            <div class="info-card-val" style="color: var(--status-present);">${presentCount}</div>
            <div class="info-card-footer">Staff checked-in today</div>
          </div>
          <div class="info-card glass" style="border-left: 4px solid var(--status-leave);">
            <div class="info-card-header">
              <span>On Leave</span>
              <span class="card-status-dot leave" style="position: static;"></span>
            </div>
            <div class="info-card-val" style="color: var(--status-leave);">${leaveCount}</div>
            <div class="info-card-footer">Staff with approved time-off</div>
          </div>
          <div class="info-card glass" style="border-left: 4px solid var(--status-absent);">
            <div class="info-card-header">
              <span>Absent</span>
              <span class="card-status-dot absent" style="position: static;"></span>
            </div>
            <div class="info-card-val" style="color: var(--status-absent);">${absentCount}</div>
            <div class="info-card-footer">Unmarked/missing check-ins</div>
          </div>
        </div>

        <div class="glass" style="grid-column: span 8; padding: 28px;">
          <h3 style="margin-bottom: 20px; font-weight: 600;">Time Off Pending Approvals</h3>
          ${pendingLeaves > 0 ? { __htmlSafe: true, value: `
            <div class="alert-banner alert-error" style="margin-bottom: 20px;">
              <span>You have ${pendingLeaves} pending leave requests requiring attention!</span>
            </div>
          ` } : ""}
          <div class="data-table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Type</th>
                  <th>Dates</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${getStore().state.timeOff.filter(l => l.status === "Pending").slice(0, 5).map(l => html`
                  <tr>
                    <td><strong>${l.employeeName}</strong></td>
                    <td>${l.leaveType}</td>
                    <td>${l.startDate} to ${l.endDate}</td>
                    <td><span class="status-badge pending">Pending</span></td>
                    <td>
                      <button class="btn btn-secondary btn-sm" type="button" data-nav-route="timeoff">Review</button>
                    </td>
                  </tr>
                `) || { __htmlSafe: true, value: `
                  <tr>
                    <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 32px;">
                      All leave requests have been processed. Clean desk!
                    </td>
                  </tr>
                `}}
              </tbody>
            </table>
          </div>
        </div>

        <div class="glass" style="grid-column: span 4; padding: 28px; display: flex; flex-direction: column; gap: 16px;">
          <h3 style="font-weight: 600; margin-bottom: 8px;">HR Admin Actions</h3>
          <button class="btn btn-primary" onclick="showOnboardModal()">Onboard New Employee</button>
          <button class="btn btn-secondary" type="button" data-nav-route="payroll">Run Payroll Module</button>
          <button class="btn btn-secondary" type="button" data-nav-route="attendance">Export Daily Attendance</button>
        </div>
      </div>
    `;
  } else {
    const attendanceRecord = getStore().getAttendanceToday(user.id);
    const isCheckedIn = attendanceRecord && !attendanceRecord.checkOut;
    const checkInTime = attendanceRecord ? attendanceRecord.checkIn : "--:--";
    const totalWorked = attendanceRecord && attendanceRecord.workHours ? `${attendanceRecord.workHours} hrs` : "0.00 hrs";
    const leaveDays = user.ptoDays;
    const sickDays = user.sickDays;

    dashboardContent = html`
      <div class="dashboard-grid animate-fade">
        <div class="checkin-widget glass glow-accent">
          <h3 style="font-weight: 600;">Work Session Clock</h3>
          <div class="checkin-time" id="clock-display">00:00:00</div>
          <div class="checkin-date">${new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
          
          <button id="clock-btn" class="checkin-btn ${isCheckedIn ? 'checked-in' : 'checked-out'}" data-wf-click="handleClockTrigger()">
            ${isCheckedIn ? 'Check Out' : 'Check In'}
          </button>

          <div class="checkin-stats">
            <div class="stat-item">
              <span class="stat-val" style="color: var(--status-present);">${checkInTime}</span>
              <span class="stat-label">Checked In</span>
            </div>
            <div class="stat-item">
              <span class="stat-val" style="color: var(--accent);">${totalWorked}</span>
              <span class="stat-label">Logged Hours</span>
            </div>
          </div>
        </div>

        <div class="quick-info-panel">
          <div class="info-card glass">
            <div class="info-card-header">
              <span>Paid Time Off</span>
              ${{ __htmlSafe: true, value: ICONS.timeoff }}
            </div>
            <div class="info-card-val">${leaveDays}</div>
            <div class="info-card-footer">Days remaining available</div>
          </div>

          <div class="info-card glass">
            <div class="info-card-header">
              <span>Sick Leaves</span>
              ${{ __htmlSafe: true, value: ICONS.timeoff }}
            </div>
            <div class="info-card-val" style="color: #6366f1;">${sickDays}</div>
            <div class="info-card-footer">Medical leaves available</div>
          </div>

          <div class="info-card glass" style="border-left: 4px solid var(--status-present);">
            <div class="info-card-header">
              <span>Attendance Rate</span>
              ${{ __htmlSafe: true, value: ICONS.attendance }}
            </div>
            <div class="info-card-val" style="color: var(--status-present);">96%</div>
            <div class="info-card-footer">Based on this calendar month</div>
          </div>

          <div class="glass" style="grid-column: span 3; padding: 24px; min-height: 240px; margin-top: 4px;">
            <h4 style="margin-bottom: 16px; font-weight: 600;">Your Recent Time Off Requests</h4>
            <div class="data-table-container">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Dates</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  ${getStore().state.timeOff.filter(l => l.employeeId === user.id).slice(0, 3).map(l => html`
                    <tr>
                      <td>${l.startDate} to ${l.endDate}</td>
                      <td>${l.leaveType}</td>
                      <td><span class="status-badge ${l.status.toLowerCase()}">${l.status}</span></td>
                      <td style="color: var(--text-muted); font-size: 0.85rem;">${l.remarks || 'N/A'}</td>
                    </tr>
                  `) || { __htmlSafe: true, value: `
                    <tr>
                      <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 18px;">
                        No leaves applied recently.
                      </td>
                    </tr>
                  `}}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  window.renderApp(html`
    ${{ __htmlSafe: true, value: sidebarHTML }}
    <div class="main-wrapper" data-layout="main">
      ${{ __htmlSafe: true, value: headerHTML }}
      <div class="view-container">
        ${{ __htmlSafe: true, value: typeof dashboardContent === 'string' ? dashboardContent : dashboardContent }}
      </div>
    </div>
  `);

  startDashboardClock();
}

export let clockInterval = null;
export function startDashboardClock() {
  if (clockInterval) clearInterval(clockInterval);
  const clockDisp = document.getElementById("clock-display");
  if (!clockDisp) return;
  
  const user = getStore().getCurrentUser();
  const updateClock = () => {
    const attendanceRecord = getStore().getAttendanceToday(user.id);
    const isCheckedIn = attendanceRecord && !attendanceRecord.checkOut;
    
    if (isCheckedIn) {
      const checkInMs = parseTimeToMs(attendanceRecord.checkIn);
      const elapsedMs = Date.now() - checkInMs;
      const elapsedSecs = Math.max(0, Math.floor(elapsedMs / 1000));
      const h = Math.floor(elapsedSecs / 3600);
      const m = Math.floor((elapsedSecs % 3600) / 60);
      const s = elapsedSecs % 60;
      clockDisp.textContent = [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
    } else {
      const now = new Date();
      clockDisp.textContent = now.toTimeString().split(" ")[0];
    }
  };
  updateClock();
  clockInterval = setInterval(updateClock, 1000);
}

export function handleClockTrigger() {
  const user = getStore().getCurrentUser();
  const attendanceToday = getStore().getAttendanceToday(user.id);
  const isCheckedIn = attendanceToday && !attendanceToday.checkOut;

  if (!isCheckedIn) {
    getStore().checkIn(user.id);
  } else {
    getStore().checkOut(user.id);
  }
  renderDashboardView();
}
