import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
const setOnline = (value) => {
  Object.defineProperty(global.navigator, 'onLine', {
    value,
    configurable: true,
    writable: true
  });
  Object.defineProperty(window.navigator, 'onLine', {
    value,
    configurable: true
  });
};

const makeHr = () => ({
  id: 'HR001',
  email: 'hr@example.com',
  role: 'HR',
  name: 'HR User',
  department: 'People',
  manager: '',
  location: 'Bangalore',
  dateOfJoining: '2026-01-01',
  wage: 50000
});

describe('SyncEngine', () => {
  let SyncEngine;
  let MockServer;
  let SyncTelemetry;

  let mockStore;
  beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();
    for (const store of Object.values(global.dbStores || {})) {
      store.clear();
    }

    setOnline(false);
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
    window.showToast = vi.fn();
    const appContext = await import('../src/app-context.js');
    const { registerStore } = appContext;
    SyncTelemetry = appContext.SyncTelemetry;
    mockStore = {
      ready: Promise.resolve(),
      state: { currentSession: null }
    };
    registerStore(mockStore);

    ({ MockServer } = await import('../src/server.js'));
    await MockServer.init();
    ({ SyncEngine } = await import('../src/sync.js'));
    await SyncEngine.init();
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    
  });

  describe('enqueue', () => {
    it('adds mutations with vector clocks, field clocks, priority, and protocol version', async () => {
      await SyncEngine.enqueue('PUT', 'employees', {
        id: 'EMP001',
        name: 'Test User'
      }, 10);

      const pending = await SyncEngine.getPendingTransactions();
      const clientId = localStorage.getItem('sync_client_id');

      expect(pending).toHaveLength(1);
      expect(pending[0]).toMatchObject({
        type: 'PUT',
        store: 'employees',
        priority: 10,
        protocolVersion: 2,
        retryCount: 0
      });
      expect(pending[0].vectorClock[clientId]).toBe(1);
      expect(pending[0].data.fieldClocks.name).toBe(1);
      expect(await SyncEngine.getQueueLength()).toBe(1);
    });

    it('returns pending transactions sorted by priority and limited by caller input', async () => {
      await SyncEngine.enqueue('PUT', 'employees', { id: '1' }, 0);
      await SyncEngine.enqueue('PUT', 'employees', { id: '2' }, 10);
      await SyncEngine.enqueue('PUT', 'employees', { id: '3' }, 5);

      const pending = await SyncEngine.getPendingTransactions(0, 2);

      expect(pending.map((item) => item.data.id)).toEqual(['2', '3']);
    });
  });

  describe('retry queue', () => {
    it('adds failed mutations to the retry queue with backoff metadata', async () => {
      const now = Date.now();

      await SyncEngine.addToRetryQueue({
        id: 99,
        type: 'PUT',
        store: 'employees',
        data: { id: 'EMP001' },
        retryCount: 0,
        priority: 1
      }, new Error('Network error'));

      const retry = global.dbStores.retry_queue.get(99);
      expect(retry).toMatchObject({
        id: 99,
        retryCount: 1,
        lastError: 'Network error'
      });
      expect(retry.nextRetryAt).toBeGreaterThanOrEqual(now + 5000);
    });

    it('stops retrying after max attempts and records telemetry', async () => {
      const logSpy = vi.spyOn(SyncTelemetry, 'log');

      await SyncEngine.addToRetryQueue({
        id: 100,
        type: 'PUT',
        store: 'employees',
        data: { id: 'EMP001' },
        retryCount: 5
      }, new Error('Permanent'));

      expect(global.dbStores.retry_queue.has(100)).toBe(false);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('exceeded max retries'));
    });
  });

  describe('sync', () => {
    it('returns false when offline', async () => {
      setOnline(false);

      const result = await SyncEngine.sync();

      expect(result).toBe(false);
    });

    it('returns false when online without an active token', async () => {
      setOnline(true);
      mockStore.state.currentSession = null;

      const result = await SyncEngine.sync();

      expect(result).toBe(false);
      expect(SyncTelemetry.recentLogs[0].message).toMatch(/No active authenticated session/);
    });

    it('processes pending transactions with the live store session', async () => {
      const hrSession = await MockServer.registerUser(makeHr(), 'Password123!');
      mockStore.state.currentSession = {
        token: hrSession.token,
        csrfToken: hrSession.csrfToken
      };
      setOnline(true);

      await SyncEngine.enqueue('PUT', 'employees', {
        id: 'EMP001',
        email: 'employee@example.com',
        role: 'Employee',
        name: 'Employee One',
        department: 'Engineering',
        manager: 'HR User',
        location: 'Bangalore',
        dateOfJoining: '2026-02-01',
        wage: 60000
      }, 10);

      const result = await SyncEngine.sync();

      expect(result).toBe(true);
      expect(await SyncEngine.getQueueLength()).toBe(0);
      const employees = await MockServer.getEmployees(hrSession.token);
      expect(employees.find((emp) => emp.id === 'EMP001')?.name).toBe('Employee One');
      expect(global.dbStores.sync_meta.get('cursor').value).toBeGreaterThan(0);
    });
  });

  describe('status listeners', () => {
    it('notifies listeners with status and queue length', async () => {
      await SyncEngine.enqueue('PUT', 'employees', { id: 'EMP001' });

      const notification = await new Promise((resolve) => {
        SyncEngine.onStatusChange((status, queueLength) => {
          resolve({ status, queueLength });
        });
      });

      expect(notification).toEqual({ status: 'offline', queueLength: 1 });
    });
  });
});
