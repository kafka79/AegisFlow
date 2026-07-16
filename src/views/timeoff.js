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

export function renderTimeOffView() {
  const user = getStore().getCurrentUser();
  const sidebarHTML = getSidebarHTML("timeoff");
  const headerHTML = getHeaderHTML("Time Off & Leave Balance");

  const isAdmin = user.role === "HR";
  let timeOffContent = "";

  if (isAdmin) {
    const requests = getStore().state.timeOff;

    timeOffContent = `
      <div class="animate-fade">
        <h3 style="margin-bottom: 20px; font-weight: 600;">Workforce Leave Requests</h3>
        
        <div class="data-table-container glass">
          <table class="data-table">
            <thead>
              <tr>
                <th>Employee ID</th>
                <th>Name</th>
                <th>Type</th>
                <th>Duration</th>
                <th>Span</th>
                <th>Remarks</th>
                <th>Attachment</th>
                <th>Status</th>
                <th>Action / Notes</th>
              </tr>
            </thead>
            <tbody>
              ${requests.map(l => {
                const fileLink = l.attachmentData ? 
                  `<a href="${l.attachmentData}" download="${l.attachmentName}" style="color: var(--accent); font-weight: 600; text-decoration: none;">View File</a>` : 
                  '<span style="color: var(--text-dim);">No Attachment</span>';

                let actionsHTML = "";
                if (l.status === "Pending") {
                  actionsHTML = `
                    <div style="display: flex; gap: 8px;">
                      <button class="btn btn-success btn-sm" onclick="showApproveCommentModal('${l.id}', 'Approved')">Approve</button>
                      <button class="btn btn-danger btn-sm" onclick="showApproveCommentModal('${l.id}', 'Rejected')">Reject</button>
                    </div>
                  `;
                } else {
                  actionsHTML = `<span style="color: var(--text-dim); font-size: 0.85rem;">${l.comment || 'Processed'}</span>`;
                }

                const displayDays = typeof l.days === 'number' ? `${l.days} Day(s)` : `${calculateDaysBetween(l.startDate, l.endDate)} Day(s)`;

                return `
                  <tr>
                    <td style="font-family: var(--font-mono); font-size: 0.85rem;">${l.employeeId}</td>
                    <td><strong>${l.employeeName}</strong></td>
                    <td>${l.leaveType}</td>
                    <td><strong>${l.startDate}</strong> to <strong>${l.endDate}</strong></td>
                    <td><strong>${displayDays}</strong></td>
                    <td>${l.remarks || '<span style="color: var(--text-dim);">None</span>'}</td>
                    <td>${fileLink}</td>
                    <td><span class="status-badge ${l.status.toLowerCase()}">${l.status}</span></td>
                    <td>${actionsHTML}</td>
                  </tr>
                `;
              }).join("") || `
                <tr>
                  <td colspan="9" style="text-align: center; color: var(--text-muted); padding: 32px;">
                    No leave requests have been applied yet.
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } else {
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const monthLabel = `${monthNames[selectedCalendarDate.getMonth()]} ${selectedCalendarDate.getFullYear()}`;

    timeOffContent = `
      <div class="animate-fade">
        <div class="timeoff-header">
          <div class="info-card glass glow-accent">
            <div class="info-card-header">
              <span>Paid Time Off (PTO)</span>
              ${ICONS.timeoff}
            </div>
            <div class="info-card-val" style="color: var(--status-present);">${user.ptoDays} Days</div>
            <div class="info-card-footer">General paid leave balance remaining</div>
          </div>
          <div class="info-card glass">
            <div class="info-card-header">
              <span>Sick Leave Balance</span>
              ${ICONS.timeoff}
            </div>
            <div class="info-card-val" style="color: var(--accent);">${user.sickDays} Days</div>
            <div class="info-card-footer font-semibold">Allocated medical leave balance remaining</div>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
          <h3 style="font-weight: 600;">Calendar Overview</h3>
          <button class="btn btn-primary" onclick="showApplyLeaveModal()">${ICONS.plus} Apply for Leave</button>
        </div>

        <div class="glass" style="padding: 24px; margin-bottom: 32px;">
          <div class="calendar-wrapper">
            <div class="calendar-header">
              <h4 style="font-weight: 600;" id="cal-month-title">${monthLabel}</h4>
              <div style="display: flex; gap: 8px;">
                <button class="calendar-nav-btn" onclick="changeCalendarMonth(-1)">&lt;</button>
                <button class="calendar-nav-btn" onclick="changeCalendarMonth(1)">&gt;</button>
              </div>
            </div>
            <div class="calendar-grid">
              <div class="calendar-day-header">Sun</div>
              <div class="calendar-day-header">Mon</div>
              <div class="calendar-day-header">Tue</div>
              <div class="calendar-day-header">Wed</div>
              <div class="calendar-day-header">Thu</div>
              <div class="calendar-day-header">Fri</div>
              <div class="calendar-day-header">Sat</div>
              
              ${renderCalendarDays(selectedCalendarDate.getFullYear(), selectedCalendarDate.getMonth())}
            </div>
          </div>
        </div>

        <h3 style="margin-bottom: 16px; font-weight: 600;">Leave Requests Log</h3>
        <div class="data-table-container glass">
          <table class="data-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Dates</th>
                <th>Span</th>
                <th>Remarks</th>
                <th>Status</th>
                <th>Approver Note</th>
              </tr>
            </thead>
            <tbody>
              ${getStore().state.timeOff.filter(l => l.employeeId === user.id).map(l => {
                const displayDays = typeof l.days === 'number' ? `${l.days} Day(s)` : `${calculateDaysBetween(l.startDate, l.endDate)} Day(s)`;
                return `
                  <tr>
                    <td><strong>${l.leaveType}</strong></td>
                    <td>${l.startDate} to ${l.endDate}</td>
                    <td><strong>${displayDays}</strong></td>
                    <td>${l.remarks || '<span style="color: var(--text-dim);">N/A</span>'}</td>
                    <td><span class="status-badge ${l.status.toLowerCase()}">${l.status}</span></td>
                    <td style="color: var(--text-muted); font-size: 0.85rem;">${l.comment || '--'}</td>
                  </tr>
                `;
              }).join("") || `
                <tr>
                  <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 32px;">
                    You have not submitted any leave requests yet.
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
        ${timeOffContent}
      </div>
    </div>
  `);
}

export function changeCalendarMonth(offset) {
  selectedCalendarDate.setMonth(selectedCalendarDate.getMonth() + offset);
  renderTimeOffView();
}

export function renderCalendarDays(year, month) {
  const user = getStore().getCurrentUser();
  const days = [];
  const todayStr = getTodayString();
  
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDayOfWeek = new Date(year, month, 1).getDay();
  
  for (let i = 0; i < startDayOfWeek; i++) {
    days.push(`<div class="calendar-day empty"></div>`);
  }

  const monthStr = String(month + 1).padStart(2, "0");
  
  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = `${year}-${monthStr}-${String(day).padStart(2, "0")}`;
    let dayClass = "";
    const isAHoliday = isHoliday(dayStr);
    
    // Status checks
    const onApprovedLeave = getStore().state.timeOff.some(l => 
      l.employeeId === user.id && 
      l.status === "Approved" && 
      dayStr >= l.startDate && 
      dayStr <= l.endDate
    );

    if (onApprovedLeave) {
      dayClass = "leave-day";
    } else if (isAHoliday) {
      dayClass = "holiday-day";
    } else {
      const att = getStore().state.attendance.find(a => a.employeeId === user.id && a.date === dayStr);
      if (att) {
        dayClass = "present-day";
      } else if (dayStr < todayStr) {
        const dateObj = new Date(dayStr);
        const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
        if (!isWeekend) {
          dayClass = "absent-day";
        }
      }
    }

    const isToday = dayStr === todayStr;

    days.push(`
      <div class="calendar-day ${dayClass} ${isToday ? 'today' : ''}" title="${isAHoliday ? NATIONAL_HOLIDAYS[dayStr] : ''}">
        <span class="calendar-day-num">${day}</span>
        ${isAHoliday ? `<span style="font-size: 0.6rem; color: var(--accent); display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${NATIONAL_HOLIDAYS[dayStr]}</span>` : ''}
        ${dayClass && !isAHoliday ? '<span class="calendar-day-marker"></span>' : ''}
      </div>
    `);
  }
  return days.join("");
}

export function showApplyLeaveModal() {
  const body = `
    <form id="leave-form" onsubmit="handleLeaveSubmit(event)">
      <div class="form-group">
        <label for="leave-type">Leave Allocation Category</label>
        <select class="input-ctrl" id="leave-type" required>
          <option value="Paid Time Off">Paid Time Off (PTO)</option>
          <option value="Sick Leave">Sick Leave</option>
          <option value="Unpaid Leave">Unpaid Leaves</option>
        </select>
      </div>

      <div class="form-group">
        <label for="leave-duration">Leave Duration</label>
        <select class="input-ctrl" id="leave-duration" onchange="toggleHalfDayOption()" required>
          <option value="Full">Full Day</option>
          <option value="FirstHalf">First Half-Day (Morning)</option>
          <option value="SecondHalf">Second Half-Day (Afternoon)</option>
        </select>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="leave-start">Start Date</label>
          <input class="input-ctrl" type="date" id="leave-start" required onchange="calculateRequestedDays()">
        </div>
        <div class="form-group">
          <label for="leave-end">End Date</label>
          <input class="input-ctrl" type="date" id="leave-end" required onchange="calculateRequestedDays()">
        </div>
      </div>

      <div class="form-group">
        <label>Leave Span Computed</label>
        <input class="input-ctrl" type="text" id="leave-days-display" value="0 Days" readonly>
      </div>

      <div class="form-group">
        <label for="leave-remarks">Reason for Absence</label>
        <textarea class="input-ctrl" id="leave-remarks" rows="3" required placeholder="Add message context for HR approvals..."></textarea>
      </div>

      <div class="form-group">
        <label for="leave-file">Certificate Attachment (Required for Sick Leave)</label>
        <input class="input-ctrl" type="file" id="leave-file">
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px;">
        <button class="btn btn-secondary" type="button" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" type="submit">Submit Request</button>
      </div>
    </form>
  `;

  showModal("Apply for Leave", body);
}

export function toggleHalfDayOption() {
  const duration = document.getElementById("leave-duration").value;
  const startEl = document.getElementById("leave-start");
  const endEl = document.getElementById("leave-end");
  if (duration !== "Full") {
    endEl.value = startEl.value;
    endEl.disabled = true;
  } else {
    endEl.disabled = false;
  }
  calculateRequestedDays();
}

export function calculateRequestedDays() {
  const start = document.getElementById("leave-start").value;
  const end = document.getElementById("leave-end").value;
  const duration = document.getElementById("leave-duration")?.value || "Full";
  const disp = document.getElementById("leave-days-display");
  if (start) {
    if (duration !== "Full") {
      disp.value = "0.5 Days";
      return;
    }
    if (end) {
      if (end < start) {
        disp.value = "Invalid Range";
        return;
      }
      const days = calculateDaysBetween(start, end);
      disp.value = `${days} Day${days > 1 ? 's' : ''}`;
    }
  }
}

export function handleLeaveSubmit(e) {
  e.preventDefault();
  const user = getStore().getCurrentUser();
  
  const lType = document.getElementById("leave-type").value;
  const start = document.getElementById("leave-start").value;
  const end = document.getElementById("leave-end").value;
  const duration = document.getElementById("leave-duration").value;
  const remarks = document.getElementById("leave-remarks").value.trim();
  const fileEl = document.getElementById("leave-file");

  if (duration === "Full" && end < start) {
    alert("End Date cannot be before Start Date.");
    return;
  }

  const days = duration !== "Full" ? 0.5 : calculateDaysBetween(start, end);

  if (lType === "Paid Time Off" && user.ptoDays < days) {
    alert(`Insufficient Paid Time Off balance! You have only ${user.ptoDays} days available.`);
    return;
  }
  if (lType === "Sick Leave" && user.sickDays < days) {
    alert(`Insufficient Sick Leave balance! You have only ${user.sickDays} days available.`);
    return;
  }

  if (lType === "Sick Leave" && fileEl.files.length === 0) {
    alert("Sick Leave requires a medical certificate upload.");
    return;
  }

  const leaveData = {
    employeeId: user.id,
    employeeName: user.name,
    leaveType: lType,
    startDate: start,
    endDate: duration !== "Full" ? start : end,
    duration: duration,
    days: days,
    remarks: remarks,
    attachmentName: "",
    attachmentData: ""
  };

  if (fileEl.files.length > 0) {
    const file = fileEl.files[0];
    leaveData.attachmentName = file.name;

    const reader = new FileReader();
    reader.onload = function(evt) {
      leaveData.attachmentData = evt.target.result;
      getStore().applyLeave(leaveData);
      closeModal();
      renderTimeOffView();
    };
    reader.readAsDataURL(file);
  } else {
    getStore().applyLeave(leaveData);
    closeModal();
    renderTimeOffView();
  }
}

export function showApproveCommentModal(leaveId, action) {
  const body = `
    <div class="form-group">
      <label for="admin-comment">Comment Note</label>
      <input class="input-ctrl" type="text" id="admin-comment" placeholder="Optional comments..." required>
    </div>
    <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px;">
      <button class="btn btn-secondary" onclick="closeModal()">Discard</button>
      <button class="btn ${action === 'Approved' ? 'btn-success' : 'btn-danger'}" onclick="submitLeaveDecision('${leaveId}', '${action}')">
        Confirm ${action}
      </button>
    </div>
  `;
  showModal(`${action} Leave Request`, body);
}

export function submitLeaveDecision(leaveId, action) {
  const comment = document.getElementById("admin-comment").value.trim();
  getStore().updateLeaveStatus(leaveId, action, comment);
  closeModal();
  renderTimeOffView();
}
