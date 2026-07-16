import { test, expect } from "@playwright/test";

test.describe("WorkForces API", () => {
  test.beforeEach(async ({ request }) => {
    await request.post("/api/test/reset");
  });

  test("merges concurrent employee field edits via /api/sync", async ({ request }) => {
    const suffix = Date.now();
    const hr = {
      id: `HR${suffix}`,
      email: `hr${suffix}@example.com`,
      role: "HR",
      name: "API HR",
      department: "People",
      manager: "",
      location: "Bangalore",
      dateOfJoining: "2026-01-01",
      wage: 50000
    };

    const register = await request.post("/api/auth/register", {
      data: { employeeDetails: hr, password: "Password123!" }
    });
    expect(register.ok(), await register.text()).toBeTruthy();
    const { token, csrfToken } = await register.json();

    const employee = {
      id: `EMP${suffix}`,
      email: `emp${suffix}@example.com`,
      role: "Employee",
      name: "John Doe",
      phone: "+91 90000 00001",
      department: "Engineering",
      manager: "API HR",
      location: "Bangalore",
      dateOfJoining: "2026-02-01",
      wage: 60000
    };

    await request.post("/api/sync", {
      headers: { Authorization: `Bearer ${token}`, "X-CSRF-Token": csrfToken },
      data: {
        transactions: [{
          id: "seed",
          type: "PUT",
          store: "employees",
          data: { ...employee, lastModified: 1 }
        }]
      }
    });

    await request.post("/api/sync", {
      headers: { Authorization: `Bearer ${token}`, "X-CSRF-Token": csrfToken },
      data: {
        transactions: [{
          id: "tab-a",
          type: "PUT",
          store: "employees",
          data: {
            ...employee,
            name: "John Tab A",
            fieldClocks: { name: 2, phone: 1 },
            vectorClock: { client_a: 2 }
          }
        }]
      }
    });

    const conflict = await request.post("/api/sync", {
      headers: { Authorization: `Bearer ${token}`, "X-CSRF-Token": csrfToken },
      data: {
        transactions: [{
          id: "tab-b",
          type: "PUT",
          store: "employees",
          data: {
            ...employee,
            phone: "+91 90000 00099",
            fieldClocks: { name: 1, phone: 3 },
            vectorClock: { client_b: 3 }
          }
        }]
      }
    });
    const conflictBody = await conflict.json();
    expect(conflictBody.conflicts).toBeGreaterThan(0);

    const list = await request.get("/api/employees", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const employees = await list.json();
    const merged = employees.find((emp) => emp.id === `EMP${suffix}`);
    expect(merged.name).toBe("John Tab A");
    expect(merged.phone).toBe("+91 90000 00099");
  });
});
