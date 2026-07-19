import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Views - Dashboard', () => {
  let renderDashboardView;
  let mockStore;

  beforeEach(async () => {
    vi.resetModules();
    document.body.innerHTML = '<div id="app"></div>';

    global.CSS = { escape: (str) => str };
    global.window.showToast = vi.fn();
    global.window.renderApp = vi.fn((html) => {
      document.getElementById('app').innerHTML = html;
    });

    const { registerStore, getStore } = await import('../src/app-context.js');

    mockStore = {
      getCurrentUser: vi.fn(() => ({ id: 'EMP001', role: 'Employee', name: 'Test User', ptoDays: 15, sickDays: 8 })),
      getAttendanceToday: vi.fn(() => null),
      state: {
        employees: [],
        timeOff: [],
        attendance: []
      }
    };
    registerStore(mockStore);

    renderDashboardView = (await import('../src/views/dashboard.js')).renderDashboardView;
  });

  it('renders employee dashboard with check-in widget', () => {
    renderDashboardView();
    const app = document.getElementById('app');
    expect(app.querySelector('.checkin-widget')).toBeTruthy();
    expect(app.querySelector('.checkin-btn')).toBeTruthy();
  });

  it('shows check-out state when employee is checked in', () => {
    mockStore.getCurrentUser.mockReturnValue({ id: 'EMP001', role: 'Employee', name: 'Test User', ptoDays: 15, sickDays: 8 });
    mockStore.getAttendanceToday.mockReturnValue({ checkIn: '09:00', checkOut: null });
    renderDashboardView();
    const app = document.getElementById('app');
    expect(app.querySelector('.checkin-btn.checked-in')).toBeTruthy();
  });

  it('renders HR dashboard with employee stats', () => {
    mockStore.getCurrentUser.mockReturnValue({ id: 'HR001', role: 'HR', name: 'HR User', ptoDays: 0, sickDays: 0 });
    mockStore.state.employees = [
      { id: 'E1', name: 'Alice', department: 'Eng' },
      { id: 'E2', name: 'Bob', department: 'Eng' }
    ];
    renderDashboardView();
    const app = document.getElementById('app');
    expect(app.querySelector('.info-card-val')?.textContent).toBe('2');
    expect(app.querySelector('[data-nav-route="payroll"]')).toBeTruthy();
  });

  it('shows empty state when no leave requests', () => {
    mockStore.getCurrentUser.mockReturnValue({ id: 'HR001', role: 'HR', name: 'HR User', ptoDays: 15, sickDays: 8 });
    renderDashboardView();
    const app = document.getElementById('app');
    const cells = app.querySelectorAll('td');
    const hasEmptyMessage = Array.from(cells).some(c => c.textContent.includes('All leave requests'));
    expect(hasEmptyMessage).toBe(true);
  });
});

describe('Views - Employees', () => {
  let renderEmployeesView;
  let mockStore;

  beforeEach(async () => {
    vi.resetModules();
    document.body.innerHTML = '<div id="app"></div>';

    global.CSS = { escape: (str) => str };
    global.window.showToast = vi.fn();
    global.window.renderApp = vi.fn((html) => {
      document.getElementById('app').innerHTML = html;
    });
    global.window.getCachedAvatar = vi.fn(() => 'data:image/svg+xml;utf8,<svg></svg>');
    global.window.selectedCalendarDate = null;

    const { registerStore } = await import('../src/app-context.js');

    mockStore = {
      getCurrentUser: vi.fn(() => ({ id: 'HR001', role: 'HR', name: 'HR User' })),
      state: {
        employees: [],
        timeOff: [],
        attendance: []
      }
    };
    registerStore(mockStore);

    renderEmployeesView = (await import('../src/views/employees.js')).renderEmployeesView;
  });

  it('shows empty state when no employees exist', () => {
    renderEmployeesView();
    const app = document.getElementById('app');
    expect(app.querySelector('.empty-state')).toBeTruthy();
    expect(app.textContent).toContain('No employees yet');
  });

  it('renders employee cards when employees exist', () => {
    mockStore.state.employees = [
      { id: 'E1', name: 'Alice Smith', department: 'Engineering', role: 'Employee' },
      { id: 'E2', name: 'Bob Jones', department: 'Design', role: 'Employee' }
    ];
    renderEmployeesView();
    const app = document.getElementById('app');
    expect(app.querySelectorAll('.employee-card').length).toBe(2);
  });

  it('shows add employee button for HR role', () => {
    mockStore.state.employees = [{ id: 'E1', name: 'Alice', department: 'Eng', role: 'Employee' }];
    renderEmployeesView();
    const app = document.getElementById('app');
    const addBtn = app.querySelector('[data-wf-click*="showOnboardModal"]');
    expect(addBtn).toBeTruthy();
  });

  it('hides add employee button for non-HR role', () => {
    mockStore.getCurrentUser.mockReturnValue({ id: 'E1', role: 'Employee', name: 'Test' });
    mockStore.state.employees = [{ id: 'E1', name: 'Alice', department: 'Eng', role: 'Employee' }];
    renderEmployeesView();
    const app = document.getElementById('app');
    const addBtn = app.querySelector('[data-wf-click*="showOnboardModal"]');
    expect(addBtn).toBeFalsy();
  });
});

describe('Views - Attendance', () => {
  let renderAttendanceView;

  beforeEach(async () => {
    vi.resetModules();
    document.body.innerHTML = '<div id="app"></div>';

    global.CSS = { escape: (str) => str };
    global.window.showToast = vi.fn();
    global.window.renderApp = vi.fn((html) => {
      document.getElementById('app').innerHTML = html;
    });
    global.window.selectedCalendarDate = null;

    const { registerStore } = await import('../src/app-context.js');
    const mockStore = {
      getCurrentUser: vi.fn(() => ({ id: 'EMP001', role: 'Employee', name: 'Test User' })),
      state: {
        employees: [],
        attendance: [],
        timeOff: []
      }
    };
    registerStore(mockStore);

    renderAttendanceView = (await import('../src/views/attendance.js')).renderAttendanceView;
  });

  it('renders attendance view without crashing', () => {
    expect(() => renderAttendanceView()).not.toThrow();
    const app = document.getElementById('app');
    expect(app.querySelector('[data-layout="main"]')).toBeTruthy();
  });
});
