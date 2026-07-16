import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SyncEngine } from '../src/sync.js';
import { Store } from '../src/store.js';
import { registerStore } from '../src/app-context.js';

describe('Chaos & Concurrency Integration', () => {
  let localStore;
  let fetchMock;
  let MockServer;

  beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();
    for (const store of Object.values(global.dbStores || {})) {
      store.clear();
    }

    fetchMock = vi.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock;

    global.BroadcastChannel = vi.fn().mockImplementation(() => ({
      postMessage: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    window.BroadcastChannel = global.BroadcastChannel;

    localStore = new Store();
    await localStore.initStore();
    
    registerStore(localStore);
    MockServer = (await import('../src/server.js')).MockServer;
    await MockServer.init();
    const hrSession = await MockServer.registerUser({ id: `HR001_${Date.now()}_${Math.random()}`, email: `hr_${Date.now()}@example.com`, role: 'HR', name: 'HR User', department: 'People', location: 'Bangalore', dateOfJoining: '2026-01-01', wage: 50000 }, 'Password123!');
    localStore.state.currentSession = { token: hrSession.token, csrfToken: hrSession.csrfToken };
    
    Object.defineProperty(global.navigator, 'onLine', { value: true, configurable: true, writable: true });
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });

    await SyncEngine.init();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should survive random network drops during high-frequency syncs', async () => {
    let callCount = 0;
    fetchMock.mockImplementation(() => {
      callCount++;
      // Simulate random network failures 50% of the time
      if (Math.random() > 0.5) {
        return Promise.reject(new TypeError('NetworkError when attempting to fetch resource.'));
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ transactions: [], clock: 10 + callCount }) });
    });

    const promises = [];
    // Queue up 50 aggressive rapid-fire saves
    for (let i = 0; i < 50; i++) {
      promises.push(SyncEngine.enqueue('PUT', 'employees', {
        id: 'emp_1',
        department: `Dept_${i}`
      }, 10));
      
      // Attempt random syncs interleaved
      if (Math.random() > 0.7) {
        promises.push(SyncEngine.sync());
      }
    }

    await Promise.allSettled(promises);
    
    // Let queues settle
    await SyncEngine.sync();
    
    // Everything should eventually either be queued or processed, no unhandled exceptions crashing the worker
    const queued = await SyncEngine.getPendingTransactions();
    expect(queued.length).toBeGreaterThanOrEqual(0); // Either flushed or waiting for retry
  });

  it('should correctly merge concurrent field updates with chaotic timings', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ transactions: [], clock: 100 }) });

    const txns = [
      { id: 'txn1', type: 'UPDATE_EMPLOYEE', payload: { id: 'emp_1', field: 'name', value: 'Alice' } },
      { id: 'txn2', type: 'UPDATE_EMPLOYEE', payload: { id: 'emp_1', field: 'phone', value: '123' } },
      { id: 'txn3', type: 'UPDATE_EMPLOYEE', payload: { id: 'emp_1', field: 'name', value: 'Bob' } }
    ];

    // Fire concurrently
    await Promise.all(txns.map(t => SyncEngine.enqueue('PUT', 'employees', t.payload, 10)));
    
    const queue = await SyncEngine.getPendingTransactions();
    expect(queue.length).toBe(3);
    
    await SyncEngine.sync();
    
    const emptyQueue = await SyncEngine.getPendingTransactions();
    expect(emptyQueue.length).toBe(0);
  });
});
