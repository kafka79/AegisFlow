import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import cryptoNode from 'crypto';

const makeEmployee = (overrides = {}) => ({
  id: overrides.id || 'HR001',
  email: overrides.email || 'hr@example.com',
  role: overrides.role || 'HR',
  name: overrides.name || 'HR User',
  department: overrides.department || 'People',
  manager: overrides.manager || '',
  location: overrides.location || 'Bangalore',
  dateOfJoining: overrides.dateOfJoining || '2026-01-01',
  wage: overrides.wage || 50000,
  ...overrides
});

describe('MockServer', () => {
  let MockServer;

  beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();
    for (const store of Object.values(global.dbStores || {})) {
      store.clear();
    }

    global.Worker = vi.fn().mockImplementation(function() {
      const workerObj = {
        postMessage: vi.fn(({ id, password, salt, iterations }) => {
          const result = cryptoNode
            .createHash('sha256')
            .update(`${password}:${salt}:${iterations || 600000}`)
            .digest('hex');
          setTimeout(() => {
            workerObj.onmessage?.({ data: { id, success: true, result } });
          }, 0);
        }),
        onmessage: null,
        terminate: vi.fn()
      };
      return workerObj;
    });
    window.Worker = global.Worker;
    window.showToast = vi.fn();
    MockServer = (await import('../src/server.js')).MockServer;
    await MockServer.init();
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('Authentication and registration', () => {
    it('allows only an HR account as the first workspace account', async () => {
      await expect(
        MockServer.registerUser(
          makeEmployee({ id: 'EMP001', email: 'emp@example.com', role: 'Employee' }),
          'Password123!'
        )
      ).rejects.toThrow(/first workspace account must be an HR account/i);

      const result = await MockServer.registerUser(makeEmployee(), 'Password123!');

      expect(result.employee.id).toBe('HR001');
      expect(result.token).toBeTruthy();
      expect(result.csrfToken).toBeTruthy();
      const employees = await MockServer.getEmployees(result.token);
      expect(employees.some((emp) => emp.id === 'HR001')).toBe(true);
    });

    it('authenticates a registered HR user and validates CSRF on sessions', async () => {
      await MockServer.registerUser(makeEmployee(), 'Password123!');

      const session = await MockServer.authenticate('hr@example.com', 'Password123!');
      const payload = await MockServer.verifySession(session.token, session.csrfToken);

      expect(payload.employeeId).toBe('HR001');
      expect(payload.role).toBe('HR');
      await expect(MockServer.verifySession(session.token, 'wrong-csrf'))
        .rejects.toThrow(/CSRF token validation failed/i);
    });

    it('rejects invalid credentials and enforces failed-login rate limiting', async () => {
      await expect(MockServer.authenticate('missing@example.com', 'wrong'))
        .rejects.toThrow(/Invalid username or password/i);

      for (let i = 0; i < 5; i++) {
        await expect(MockServer.authenticate('locked@example.com', 'wrong'))
          .rejects.toThrow(/Invalid username or password/i);
      }

      await expect(MockServer.authenticate('locked@example.com', 'wrong'))
        .rejects.toThrow(/Too many failed attempts/i);
    });

    it('requires an authenticated HR session for later account registrations', async () => {
      const hr = await MockServer.registerUser(makeEmployee(), 'Password123!');
      const employee = makeEmployee({
        id: 'EMP001',
        email: 'employee@example.com',
        role: 'Employee',
        name: 'Employee One'
      });

      await expect(MockServer.registerUser(employee, 'Password123!'))
        .rejects.toThrow(/Authorization token is required/i);

      const employeeResult = await MockServer.registerUser(
        employee,
        'Password123!',
        hr.token,
        hr.csrfToken
      );

      expect(employeeResult.employee.id).toBe('EMP001');
      await expect(
        MockServer.registerUser(
          makeEmployee({ id: 'EMP002', email: 'employee@example.com', role: 'Employee' }),
          'Password123!',
          hr.token,
          hr.csrfToken
        )
      ).rejects.toThrow(/Email already exists/i);

      await expect(
        MockServer.registerUser(
          makeEmployee({ id: 'EMP003', email: 'another@example.com', role: 'Employee' }),
          'Password123!',
          employeeResult.token,
          employeeResult.csrfToken
        )
      ).rejects.toThrow(/Only HR personnel/i);
    });
  });

  describe('Sync transactions', () => {
    it('applies HR employee mutations and rejects non-HR changes to other employees', async () => {
      const hr = await MockServer.registerUser(makeEmployee(), 'Password123!');
      const employee = await MockServer.registerUser(
        makeEmployee({ id: 'EMP001', email: 'employee@example.com', role: 'Employee' }),
        'Password123!',
        hr.token,
        hr.csrfToken
      );

      const hrSync = await MockServer.syncTransactions(hr.token, [{
        id: 'sync-1',
        type: 'PUT',
        store: 'employees',
        data: makeEmployee({ id: 'EMP002', email: 'two@example.com', role: 'Employee' })
      }], hr.csrfToken);

      expect(hrSync.results).toEqual([{ id: 'sync-1', status: 'success' }]);
      const employees = await MockServer.getEmployees(hr.token);
      expect(employees.find((emp) => emp.id === 'EMP002')?.email).toBe('two@example.com');

      const denied = await MockServer.syncTransactions(employee.token, [{
        id: 'sync-2',
        type: 'PUT',
        store: 'employees',
        data: { id: 'EMP002', name: 'Tampered' }
      }], employee.csrfToken);

      expect(denied.results[0]).toMatchObject({
        id: 'sync-2',
        status: 'error'
      });
      expect(denied.results[0].error).toMatch(/Unauthorized modification/);
    });

    it('rejects unauthorized deletions', async () => {
      const hr = await MockServer.registerUser(makeEmployee(), 'Password123!');
      const employee = await MockServer.registerUser(
        makeEmployee({ id: 'EMP001', email: 'employee@example.com', role: 'Employee' }),
        'Password123!',
        hr.token,
        hr.csrfToken
      );

      const result = await MockServer.syncTransactions(employee.token, [{
        id: 'delete-1',
        type: 'DELETE',
        store: 'employees',
        data: { id: 'EMP001' }
      }], employee.csrfToken);

      expect(result.results[0].status).toBe('error');
      expect(result.results[0].error).toMatch(/Only HR can delete/);
    });
  });

  describe('Document storage', () => {
    it('saves, retrieves, and deletes documents with a valid session', async () => {
      const hr = await MockServer.registerUser(makeEmployee(), 'Password123!');
      const blob = { name: 'contract.pdf', bytes: [1, 2, 3] };

      await expect(MockServer.saveDocument(hr.token, 'doc-1', blob, hr.csrfToken))
        .resolves.toEqual({ success: true });
      await expect(MockServer.getDocument(hr.token, 'doc-1')).resolves.toEqual(blob);
      await expect(MockServer.deleteDocument(hr.token, 'doc-1', hr.csrfToken))
        .resolves.toEqual({ success: true });
      await expect(MockServer.getDocument(hr.token, 'doc-1')).resolves.toBeNull();
    });
  });
});
