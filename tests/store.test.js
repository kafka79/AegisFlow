import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Store', () => {
  let Store;
  let MockServer;
  let storeInstance;
  let DEFAULT_ADMIN;

  const installWindowHelpers = () => {
    window.generateEmployeeId = (emp, existing) => {
      const year = new Date(emp.dateOfJoining).getFullYear();
      const initials = emp.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
      const serial = String(existing.length + 1).padStart(4, '0');
      return `ODI${initials}${year}${serial}`;
    };
    window.getTodayString = () => '2026-07-03';
    window.getNowTimeString = () => '09:30:00';
    window.parseTimeToMs = (timeStr) => {
      const [h, m, s] = timeStr.split(':').map(Number);
      const d = new Date();
      d.setHours(h, m, s, 0);
      return d.getTime();
    };
    window.calculateDaysBetween = (start, end) =>
      Math.floor((new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24)) + 1;
    window.logAudit = vi.fn();
    window.getAuditLog = vi.fn(() => []);
    window.calculateProfessionalTax = vi.fn(() => 200);
    window.calculateTDS = vi.fn(() => ({ annual: 0, monthly: 0 }));
    window.getSalaryBreakdown = vi.fn(() => ({
      basic: 25000,
      hra: 10000,
      standard: 5000,
      bonus: 3750,
      lta: 2083,
      fixed: 4167,
      employerPf: 1800,
      employeePf: 1800,
      employerEsi: 0,
      employeeEsi: 0,
      pt: 200,
      gratuity: 0,
      tds: { annual: 0, monthly: 0 },
      totalDeductions: 3800,
      netSalary: 46200
    }));
    window.showToast = vi.fn();
  };

  beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();
    for (const store of Object.values(global.dbStores || {})) {
      store.clear();
    }
    installWindowHelpers();

    MockServer = (await import('../src/server.js')).MockServer;
    await MockServer.init();

    const storeModule = await import('../src/store.js');
    Store = storeModule.Store;
    DEFAULT_ADMIN = storeModule.DEFAULT_ADMIN;
    const appContext = await import('../src/app-context.js');
    storeInstance = appContext.getStore();
    await storeInstance.ready;
    storeInstance.state.currentSession = {
      employeeId: DEFAULT_ADMIN.id,
      token: 'local-token',
      csrfToken: 'local-csrf'
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('State Persistence', () => {
    it('initializes with IndexedDB', () => {
      expect(indexedDB.open).toHaveBeenCalledWith('workforces_store_db', 1);
      expect(global.dbStores.state.get('app_state')).toBeDefined();
    });

    it('loads state from IndexedDB', async () => {
      const seeded = Store.createEmptyState();
      seeded.users = [{ employeeId: 'EMPX', email: 'x@example.com', role: 'Employee' }];
      seeded.employees = [{ id: 'EMPX', name: 'Seed User', role: 'Employee' }];
      global.dbStores.state.set('app_state', { key: 'app_state', value: seeded });

      const otherStore = new Store();
      await otherStore.ready;

      expect(otherStore.getEmployee('EMPX').name).toBe('Seed User');
    });

    it('saves state to IndexedDB and mirrors sync session in localStorage', async () => {
      storeInstance.state.employees[0].name = 'Persisted Admin';

      await storeInstance.saveState();

      expect(global.dbStores.state.get('app_state').value.employees[0].name).toBe('Persisted Admin');
      const mirrored = JSON.parse(localStorage.getItem('workforces_state'));
      expect(mirrored.currentSession.employeeId).toBe(DEFAULT_ADMIN.id);
    });
  });

  describe('Employee Management', () => {
    it('gets current user', () => {
      const user = storeInstance.getCurrentUser();
      expect(user.id).toBe(DEFAULT_ADMIN.id);
    });

    it('gets employee by ID', () => {
      const emp = storeInstance.getEmployee(DEFAULT_ADMIN.id);
      expect(emp.name).toBe('HR Admin');
    });

    it('updates employee with audit log', () => {
      const result = storeInstance.updateEmployee(DEFAULT_ADMIN.id, { name: 'New Name' }, 'actor1', 'HR');

      expect(result).toBe(true);
      expect(window.logAudit).toHaveBeenCalledWith(
        'UPDATE',
        'employee',
        DEFAULT_ADMIN.id,
        expect.objectContaining({ name: { old: 'HR Admin', new: 'New Name' } }),
        'actor1',
        'HR'
      );
    });

    it('adds new employee through the mock backend using the current HR session', async () => {
      const hrSession = await MockServer.registerUser(DEFAULT_ADMIN, 'Password123!');
      storeInstance.state.currentSession = {
        employeeId: DEFAULT_ADMIN.id,
        token: hrSession.token,
        csrfToken: hrSession.csrfToken
      };

      const result = await storeInstance.addEmployee({
        name: 'Jane Doe',
        email: 'jane@example.com',
        phone: '+91 99999 99999',
        role: 'Employee',
        department: 'Engineering',
        manager: 'HR Admin',
        location: 'Bangalore',
        dateOfJoining: '2026-01-01',
        wage: 60000,
        dob: '1995-01-01',
        address: 'Bangalore',
        nationality: 'Indian',
        gender: 'Female',
        maritalStatus: 'Single',
        bankName: 'SBI',
        accountNo: '1234567890',
        ifsc: 'SBIN0001234',
        pan: 'ABCDE1234F'
      }, 'Password123!');

      expect(result.id).toBe('ODIJD20260004');
      expect(storeInstance.state.employees.some((emp) => emp.email === 'jane@example.com')).toBe(true);
      expect(window.logAudit).toHaveBeenCalledWith(
        'CREATE',
        'employee',
        'ODIJD20260004',
        expect.any(Object),
        'ODIJD20260004',
        'Employee'
      );
    });
  });

  describe('Attendance', () => {
    it('gets attendance for today', () => {
      const today = storeInstance.getAttendanceToday('ODIJD20260002');
      expect(today.id).toBe('ATT001');
    });

    it('checks in employee', () => {
      const record = storeInstance.checkIn(DEFAULT_ADMIN.id);
      expect(record).toMatchObject({
        employeeId: DEFAULT_ADMIN.id,
        checkIn: '09:30:00',
        status: 'Present'
      });
    });

    it('checks out employee', () => {
      window.getNowTimeString = () => '09:00:00';
      storeInstance.checkIn(DEFAULT_ADMIN.id);
      window.getNowTimeString = () => '18:15:00';

      const record = storeInstance.checkOut(DEFAULT_ADMIN.id);

      expect(record.checkOut).toBe('18:15:00');
      expect(record.workHours).toBeGreaterThan(0);
      expect(record.extraHours).toBeGreaterThan(0);
    });
  });

  describe('Leave Management', () => {
    it('applies leave and logs the request', () => {
      storeInstance.applyLeave({
        employeeId: DEFAULT_ADMIN.id,
        leaveType: 'Paid Time Off',
        startDate: '2026-07-15',
        endDate: '2026-07-16',
        remarks: 'Vacation'
      }, DEFAULT_ADMIN.id, 'Employee');

      expect(window.logAudit).toHaveBeenCalledWith(
        'CREATE',
        'timeoff',
        expect.any(String),
        expect.any(Object),
        DEFAULT_ADMIN.id,
        'Employee'
      );
    });

    it('approves leave and updates balances', () => {
      const leave = {
        id: 'LV002',
        employeeId: DEFAULT_ADMIN.id,
        leaveType: 'Paid Time Off',
        startDate: '2026-07-15',
        endDate: '2026-07-16',
        days: 2,
        status: 'Pending'
      };
      storeInstance.state.timeOff.push(leave);

      const result = storeInstance.updateLeaveStatus('LV002', 'Approved', 'Approved by HR', 'HR001', 'HR');

      expect(result).toBe(true);
      expect(storeInstance.getEmployee(DEFAULT_ADMIN.id).ptoDays).toBe(28);
    });

    it('rejects leave', () => {
      storeInstance.state.timeOff.push({
        id: 'LV003',
        employeeId: DEFAULT_ADMIN.id,
        leaveType: 'Paid Time Off',
        startDate: '2026-07-15',
        endDate: '2026-07-16',
        days: 2,
        status: 'Pending'
      });

      const result = storeInstance.updateLeaveStatus('LV003', 'Rejected', 'Insufficient balance', 'HR001', 'HR');

      expect(result).toBe(true);
      expect(window.logAudit).toHaveBeenCalledWith(
        'REJECT',
        'timeoff',
        'LV003',
        expect.any(Object),
        'HR001',
        'HR'
      );
    });
  });

  describe('XSS Prevention', () => {
    it('sanitizes data before storage', async () => {
      storeInstance.updateEmployee(DEFAULT_ADMIN.id, {
        name: '<script>alert(1)</script>Ada',
        avatar: '<img src=x onerror=alert(1)>'
      }, 'actor1', 'HR');

      await storeInstance.saveState();

      const saved = global.dbStores.state.get('app_state').value;
      const savedAdmin = saved.employees.find((emp) => emp.id === DEFAULT_ADMIN.id);
      expect(savedAdmin.name).toBe('Ada');
      expect(savedAdmin.avatar).not.toContain('onerror=');
      expect(savedAdmin.avatar).toContain('data-on=');
    });
  });

  describe('Audit Logging', () => {
    it('logs check-in/out operations', () => {
      storeInstance.checkIn(DEFAULT_ADMIN.id);

      expect(window.logAudit).toHaveBeenCalledWith(
        'CHECK_IN',
        'attendance',
        expect.any(String),
        expect.any(Object),
        DEFAULT_ADMIN.id,
        'Employee'
      );
    });
  });
});
