import { describe, it, expect, beforeEach } from "vitest";
import { createEngine } from "../backend/engine.js";
import { resetLocalStoragePolyfill } from "../backend/polyfill.js";

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

describe("Sync conflict integration", () => {
  /** @type {ReturnType<createEngine>} */
  let engine;
  let token;
  let csrfToken;

  beforeEach(async () => {
    resetLocalStoragePolyfill();
    localStorage.clear();
    engine = createEngine({ memory: true });
    await engine.init();
    const hr = await engine.registerUser(makeHr(), "Password123!");
    token = hr.token;
    csrfToken = hr.csrfToken;
    await engine.syncTransactions(token, [{
      id: "seed-1",
      type: "PUT",
      store: "employees",
      data: { ...baseEmployee, lastModified: 1 }
    }], csrfToken);
  });

  it("merges concurrent edits to different fields through syncTransactions", async () => {
    const tabA = {
      ...baseEmployee,
      name: "John Tab A",
      fieldClocks: { name: 2, phone: 1 },
      vectorClock: { client_a: 2 }
    };
    const tabB = {
      ...baseEmployee,
      phone: "+91 90000 00099",
      fieldClocks: { name: 1, phone: 3 },
      vectorClock: { client_b: 3 }
    };

    const first = await engine.syncTransactions(token, [{
      id: "sync-a",
      type: "PUT",
      store: "employees",
      data: tabA
    }], csrfToken);
    expect(first.results[0].status).toBe("success");

    const second = await engine.syncTransactions(token, [{
      id: "sync-b",
      type: "PUT",
      store: "employees",
      data: tabB
    }], csrfToken);
    expect(second.conflicts).toBeGreaterThan(0);
    expect(second.results[0].status).toBe("conflict");

    const employees = await engine.getEmployees(token);
    const merged = employees.find((emp) => emp.id === "EMP001");
    expect(merged.name).toBe("John Tab A");
    expect(merged.phone).toBe("+91 90000 00099");
  });
});
