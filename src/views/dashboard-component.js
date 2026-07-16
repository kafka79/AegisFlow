import { getStore, getRouter } from '../app-context.js';
/**
 * Component-based dashboard view demonstrating the new component system.
 */

import { Component, CardComponent, createButton, createEmptyState, createSpinner } from "../components.js";

export class DashboardView extends Component {
  constructor(props = {}) {
    super(props);
    this.state = {
      user: null,
      attendanceRecord: null,
      isCheckedIn: false,
      clockTime: '00:00:00',
      leaveDays: 0,
      sickDays: 0,
      recentLeaves: []
    };
    this.clockInterval = null;
  }

  onMount() {
    this.loadData();
    this.startClock();
  }

  onUnmount() {
    if (this.clockInterval) clearInterval(this.clockInterval);
  }

  loadData() {
    const user = getStore().getCurrentUser();
    const attendanceRecord = getStore().getAttendanceToday(user.id);
    const isCheckedIn = attendanceRecord && !attendanceRecord.checkOut;
    const checkInTime = attendanceRecord ? attendanceRecord.checkIn : "--:--";
    const totalWorked = attendanceRecord && attendanceRecord.workHours ? `${attendanceRecord.workHours} hrs` : "0.00 hrs";

    this.setState({
      user,
      attendanceRecord,
      isCheckedIn,
      checkInTime,
      totalWorked,
      leaveDays: user.ptoDays,
      sickDays: user.sickDays,
      recentLeaves: getStore().state.timeOff.filter(l => l.employeeId === user.id).slice(0, 3)
    });
  }

  startClock() {
    if (this.clockInterval) clearInterval(this.clockInterval);
    this.clockInterval = setInterval(() => this.updateClock(), 1000);
    this.updateClock();
  }

  updateClock() {
    const user = getStore().getCurrentUser();
    if (!user) return;
    
    const attendanceRecord = getStore().getAttendanceToday(user.id);
    const isCheckedIn = attendanceRecord && !attendanceRecord.checkOut;

    if (isCheckedIn) {
      const checkInMs = this.parseTimeToMs(attendanceRecord.checkIn);
      const elapsedMs = Date.now() - checkInMs;
      const elapsedSecs = Math.max(0, Math.floor(elapsedMs / 1000));
      const h = Math.floor(elapsedSecs / 3600);
      const m = Math.floor((elapsedSecs % 3600) / 60);
      const s = elapsedSecs % 60;
      this.setState({ clockTime: [h, m, s].map(v => String(v).padStart(2, '0')).join(':') });
    } else {
      const now = new Date();
      this.setState({ clockTime: now.toTimeString().split(" ")[0] });
    }
  }

  parseTimeToMs(timeStr) {
    const [h, m, s] = timeStr.split(':').map(Number);
    const today = new Date();
    today.setHours(h, m, s || 0, 0);
    return today.getTime();
  }

  handleClockTrigger() {
    const user = getStore().getCurrentUser();
    const attendanceToday = getStore().getAttendanceToday(user.id);
    const isCheckedIn = attendanceToday && !attendanceToday.checkOut;

    if (!isCheckedIn) {
      getStore().checkIn(user.id);
    } else {
      getStore().checkOut(user.id);
    }
    this.loadData();
  }

  render() {
    const { user, isCheckedIn, clockTime, checkInTime, totalWorked, leaveDays, sickDays, recentLeaves } = this.state;

    if (!user) {
      return this.createElement('<div>Loading...</div>');
    }

    if (user.role === 'HR') {
      return this.renderHRDashboard(user);
    }

    return this.renderEmployeeDashboard(user, isCheckedIn, clockTime, checkInTime, totalWorked, leaveDays, sickDays, recentLeaves);
  }

  renderHRDashboard(user) {
    return this.createElement(`
      ${this.getSidebarHTML()}
      <div class="main-wrapper" data-layout="main">
        ${this.getHeaderHTML()}
        <div class="view-container">
          <div class="dashboard-grid animate-fade">
            <div class="hr-stats-grid">
              ${this.createStatCard('Total Employees', getStore().state.employees.length, 'users', 'employees').outerHTML}
              ${this.createStatCard('Present Today', getStore().state.attendance.filter(a => a.status === 'Present').length, 'check-circle', 'attendance').outerHTML}
              ${this.createStatCard('On Leave', getStore().state.attendance.filter(a => a.status === 'Leave').length, 'calendar-x', 'attendance').outerHTML}
              ${this.createStatCard('Pending Leaves', getStore().state.timeOff.filter(l => l.status === 'Pending').length, 'clock', 'timeoff').outerHTML}
            </div>

            <div class="hr-quick-actions glass">
              <h3 style="font-weight: 600; margin-bottom: 16px;">Quick Actions</h3>
              <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                ${createButton('Onboard Employee', 'primary', '', 'showOnboardModal()')}
                ${createButton('Export Attendance', 'secondary', '', 'exportAttendance()')}
                ${createButton('Run Payroll', 'secondary', '', 'window.location.hash = "#payroll"')}
                ${createButton('Sync Now', 'secondary', '', 'SyncEngine.sync()')}
              </div>
            </div>

            <div class="recent-activity glass">
              <h3 style="font-weight: 600; margin-bottom: 16px;">Recent Onboarding</h3>
              ${this.renderRecentEmployees()}
            </div>
          </div>
        </div>
      </div>
    `);
  }

  renderEmployeeDashboard(user, isCheckedIn, clockTime, checkInTime, totalWorked, leaveDays, sickDays, recentLeaves) {
    return this.createElement(`
      ${this.getSidebarHTML()}
      <div class="main-wrapper" data-layout="main">
        ${this.getHeaderHTML()}
        <div class="view-container">
          <div class="dashboard-grid animate-fade">
            <div class="checkin-widget glass glow-accent">
              <h3 style="font-weight: 600;">Work Session Clock</h3>
              <div class="checkin-time" id="clock-display">${clockTime}</div>
              <div class="checkin-date">${new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
              ${createButton(isCheckedIn ? 'Check Out' : 'Check In', isCheckedIn ? 'secondary' : 'primary', '', 'handleClockTrigger()', false, { id: 'clock-btn', class: `checkin-btn ${isCheckedIn ? 'checked-in' : 'checked-out'}` })}
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
                <div class="info-card-header"><span>Paid Time Off</span>${ICONS.timeoff}</div>
                <div class="info-card-val">${leaveDays}</div>
                <div class="info-card-footer">Days remaining available</div>
              </div>
              <div class="info-card glass">
                <div class="info-card-header"><span>Sick Leaves</span>${ICONS.timeoff}</div>
                <div class="info-card-val" style="color: #6366f1;">${sickDays}</div>
                <div class="info-card-footer">Medical leaves available</div>
              </div>
              <div class="info-card glass" style="border-left: 4px solid var(--status-present);">
                <div class="info-card-header"><span>Attendance Rate</span>${ICONS.attendance}</div>
                <div class="info-card-val" style="color: var(--status-present);">96%</div>
                <div class="info-card-footer">Based on this calendar month</div>
              </div>
              <div class="glass" style="grid-column: span 3; padding: 24px; min-height: 240px; margin-top: 4px;">
                <h4 style="margin-bottom: 16px; font-weight: 600;">Your Recent Time Off Requests</h4>
                ${recentLeaves.length > 0 
                  ? this.renderLeaveTable(recentLeaves)
                  : createEmptyState('📝', 'No leaves applied recently', 'Your time off requests will appear here', null)
                }
              </div>
            </div>
          </div>
        </div>
      </div>
    `);
  }

  renderLeaveTable(leaves) {
    return `
      <div class="data-table-container">
        <table class="data-table">
          <thead>
            <tr><th>Dates</th><th>Type</th><th>Status</th><th>Remarks</th></tr>
          </thead>
          <tbody>
            ${leaves.map(l => `
              <tr>
                <td>${l.startDate} to ${l.endDate}</td>
                <td>${l.leaveType}</td>
                <td><span class="status-badge ${l.status.toLowerCase()}">${l.status}</span></td>
                <td style="color: var(--text-muted); font-size: 0.85rem;">${l.remarks || 'N/A'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  renderRecentEmployees() {
    const recent = getStore().state.employees.slice(-5).reverse();
    if (recent.length === 0) {
      return createEmptyState('👥', 'No employees yet', 'Start by onboarding your first team member', { handler: 'showOnboardModal()', label: 'Onboard Employee' });
    }
    return `
      <div class="data-table-container">
        <table class="data-table">
          <thead><tr><th>Name</th><th>Role</th><th>Department</th><th>Status</th><th>Joined</th></tr></thead>
          <tbody>
            ${recent.map(e => `
              <tr>
                <td>${this.escapeHtml(e.name)}</td>
                <td>${e.role}</td>
                <td>${e.department}</td>
                <td><span class="status-badge ${e.status.toLowerCase()}">${e.status}</span></td>
                <td>${e.dateOfJoining}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  createStatCard(label, value, icon, route) {
    return this.h('div', { class: 'stat-card glass', 'data-nav-route': route },
      this.h('div', { class: 'stat-icon' }, ICONS[icon]),
      this.h('div', { class: 'stat-value' }, value),
      this.h('div', { class: 'stat-label' }, label)
    );
  }

  escapeHtml(text) {
    return String(text ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    })[m]);
  }

  getSidebarHTML() {
    return window.getSidebarHTML?.() || '';
  }

  getHeaderHTML() {
    return window.getHeaderHTML?.() || '';
  }
}

// Register the component
import { registerComponent } from "../components.js";
registerComponent('DashboardView', DashboardView);

// Export for backward compatibility
export function renderDashboardView() {
  const view = new DashboardView();
  view.mount(document.getElementById('app') || document.body);
}

export { clockInterval } from "./dashboard.js";
