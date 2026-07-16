import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const setOnline = (value) => {
  Object.defineProperty(global.navigator, "onLine", {
    value,
    configurable: true,
    writable: true
  });
  Object.defineProperty(window.navigator, "onLine", { value, configurable: true });
};

const makeHr = () => ({
  id: "HR001",
  email: "hr@example.com",
  role: "HR",
  name: "HR User",
  department: "People",
  manager: "",
  location: "Bangalore",
  dateOfJoining: "2026-01-01",
  wage: 50000
});

const baseEmployee = {
  id: "EMP001",
  email: "employee@example.com",
  role: "Employee",
  name: "John Doe",
  phone: "+91 90000 00001",
  department: "Engineering",
  manager: "HR User",
  location: "Bangalore",
  dateOfJoining: "2026-02-01",
  wage: 60000
};

describe("Client-server cache reconciliation", () => {
  let SyncEngine;
  let MockServer;

  let mockStore;
  beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();
    for (const store of Object.values(global.dbStores || {})) {
      store.clear();
    }

    setOnline(true);
    global.fetch = vi.fn().mockResolvedValue({ ok: true });

    ({ MockServer } = await import("../src/server.js"));
    await MockServer.init();

    const hrSession = await MockServer.registerUser(makeHr(), "Password123!");
    await MockServer.syncTransactions(hrSession.token, [{
      id: "seed-emp",
      type: "PUT",
      store: "employees",
      data: { ...baseEmployee, lastModified: 1 }
    }], hrSession.csrfToken);

    const { registerStore } = await import('../src/app-context.js');
    mockStore = {
      ready: Promise.resolve(),
      state: {
        currentSession: {
          token: hrSession.token,
          csrfToken: hrSession.csrfToken,
          employeeId: makeHr().id,
          role: "HR"
        },
        employees: [{ ...baseEmployee, name: "Stale Local Cache" }]
      },
      saveState: vi.fn()
    };
    registerStore(mockStore);

    ({ SyncEngine } = await import("../src/sync.js"));
    await SyncEngine.init();
  });

  afterEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    
  });

  it("refreshes client IndexedDB cache from server after offline sync completes", async () => {
    await SyncEngine.enqueue("PUT", "employees", {
      ...baseEmployee,
      name: "Updated After Sync"
    }, 10);

    const synced = await SyncEngine.sync();
    expect(synced).toBe(true);

    const serverEmployees = await MockServer.getEmployees(mockStore.state.currentSession.token);
    const merged = serverEmployees.find((emp) => emp.id === "EMP001");

    expect(merged.name).toBe("Updated After Sync");
    expect(mockStore.state.employees).toEqual(serverEmployees);
    expect(mockStore.saveState).toHaveBeenCalled();
  });
});
