import { test, expect } from "@playwright/test";

test.describe("WorkForces browser UI", () => {
  test.beforeEach(async ({ request }) => {
    await request.post("/api/test/reset");
  });

  test("login, navigate employees, and reconcile after offline edit", async ({ page, request }) => {
    const suffix = Date.now();
    const password = "Password123!";
    const hr = {
      id: `HR${suffix}`,
      email: `hr-ui${suffix}@example.com`,
      role: "HR",
      name: "UI HR Admin",
      department: "People",
      manager: "",
      location: "Bangalore",
      dateOfJoining: "2026-01-01",
      wage: 50000
    };

    const register = await request.post("/api/auth/register", {
      data: { employeeDetails: hr, password }
    });
    expect(register.ok(), await register.text()).toBeTruthy();

    const employee = {
      id: `EMP${suffix}`,
      email: `emp-ui${suffix}@example.com`,
      role: "Employee",
      name: "John Doe",
      phone: "+91 90000 00001",
      department: "Engineering",
      manager: "UI HR Admin",
      location: "Bangalore",
      dateOfJoining: "2026-02-01",
      wage: 60000
    };

    const { token, csrfToken } = await register.json();
    await request.post("/api/sync", {
      headers: { Authorization: `Bearer ${token}`, "X-CSRF-Token": csrfToken },
      data: {
        transactions: [{
          id: "seed-ui",
          type: "PUT",
          store: "employees",
          data: { ...employee, lastModified: 1 }
        }]
      }
    });

    await page.goto("/login");
    await page.fill("#login-email", hr.email);
    await page.fill("#login-password", password);
    await page.locator("#login-form button[type='submit']").click();

    await expect(page.locator(".view-title")).toHaveText("Dashboard", { timeout: 15000 });

    await page.locator('[data-nav-route="employees"]').click();
    await expect(page.locator(".view-title")).toHaveText("Employees");

    await page.context().setOffline(true);
    await page.evaluate(({ empId, newName }) => {
      const emp = window.store.state.employees.find((e) => e.id === empId);
      if (emp) {
        emp.name = newName;
        window.store.saveState();
      }
      return window.SyncEngine.enqueue("PUT", "employees", { ...emp, name: newName });
    }, { empId: employee.id, newName: "John Offline Edit" });

    await expect(page.locator(".sync-text")).toContainText(/Offline|Pending/i, { timeout: 10000 });

    await page.context().setOffline(false);
    await expect(page.locator(".sync-text")).toHaveText("Cloud Synced", { timeout: 30000 });

    const list = await request.get("/api/employees", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const employees = await list.json();
    expect(employees.find((e) => e.id === employee.id)?.name).toBe("John Offline Edit");
  });

  test("multi-tab demo: both tabs reach dashboard after login", async ({ browser, request }) => {
    const suffix = Date.now();
    const password = "Password123!";
    const hr = {
      id: `HRMT${suffix}`,
      email: `hr-mt${suffix}@example.com`,
      role: "HR",
      name: "Multi Tab HR",
      department: "People",
      manager: "",
      location: "Bangalore",
      dateOfJoining: "2026-01-01",
      wage: 50000
    };

    const register = await request.post("/api/auth/register", {
      data: { employeeDetails: hr, password }
    });
    expect(register.ok()).toBeTruthy();

    const context = await browser.newContext();
    const tabA = await context.newPage();
    const tabB = await context.newPage();

    for (const tab of [tabA, tabB]) {
      await tab.goto("/login");
      await tab.fill("#login-email", hr.email);
      await tab.fill("#login-password", password);
      await tab.locator("#login-form button[type='submit']").click();
      await expect(tab.locator(".view-title")).toHaveText("Dashboard", { timeout: 15000 });
    }

    await context.close();
  });
});
