import { describe, it, expect, vi, beforeEach } from "vitest";

describe("E2E & Integration Flows", () => {
  let MockServer, helpers, store;

  beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();
    for (const storeMap of Object.values(global.dbStores || {})) {
      storeMap.clear();
    }

    if (!global.window) global.window = {};
    Object.assign(global.window, {
      SyncTelemetry: {
        log: vi.fn(),
        successCount: 0,
        failureCount: 0,
        conflictCount: 0,
        recentLogs: []
      },
      showToast: vi.fn(),
      navigator: { onLine: true }
    });

    MockServer = (await import("../src/server.js")).MockServer;
    helpers = await import("../src/helpers.js");
    store = (await import("../src/store.js")).store;

    await MockServer.init();
  });

  describe("Flexible ID Formatting and Generation", () => {
    it("validates templates correctly", () => {
      expect(helpers.validateIdFormat("ODI{initials}{year}{serial}")).toBe(true);
      expect(helpers.validateIdFormat("EMP{uuid}")).toBe(true);
      
      // Missing required placeholder
      expect(helpers.validateIdFormat("ODI{initials}{year}")).toBe(false);
      // Mismatched braces
      expect(helpers.validateIdFormat("ODI{initials}{year}{serial")).toBe(false);
      // Unallowed placeholder
      expect(helpers.validateIdFormat("ODI{name}{serial}")).toBe(false);
    });

    it("generates IDs matching the configured pattern", () => {
      const emp = {
        name: "Sayan Roy",
        dateOfJoining: "2026-07-12"
      };
      
      localStorage.setItem("employee_id_format", "ODI{initials}{year}{serial}");
      let id1 = helpers.generateEmployeeId(emp, []);
      expect(id1).toBe("ODISR20260001");

      localStorage.setItem("employee_id_format", "PREFIX-{serial}-{year}");
      let id2 = helpers.generateEmployeeId(emp, []);
      expect(id2).toBe("PREFIX-0001-2026");
    });
  });

  describe("State-Aware Professional Tax Calculations", () => {
    it("calculates Karnataka PT correctly", () => {
      expect(helpers.calculateProfessionalTax(12000, "Karnataka")).toBe(0);
      expect(helpers.calculateProfessionalTax(18000, "Karnataka")).toBe(200);
      expect(helpers.calculateProfessionalTax(100000, "Karnataka")).toBe(200);
    });

    it("calculates Maharashtra PT correctly", () => {
      expect(helpers.calculateProfessionalTax(6000, "Mumbai")).toBe(0);
      expect(helpers.calculateProfessionalTax(9000, "Pune")).toBe(175);
      
      // Non-February month
      const originalGetMonth = Date.prototype.getMonth;
      Date.prototype.getMonth = () => 0; // January
      expect(helpers.calculateProfessionalTax(12000, "Maharashtra")).toBe(200);

      // February month
      Date.prototype.getMonth = () => 1; // February
      expect(helpers.calculateProfessionalTax(12000, "Maharashtra")).toBe(250);
      
      Date.prototype.getMonth = originalGetMonth;
    });

    it("calculates Tamil Nadu PT correctly", () => {
      expect(helpers.calculateProfessionalTax(10000, "Chennai")).toBe(0);
      expect(helpers.calculateProfessionalTax(15000, "Tamil Nadu")).toBe(185);
      expect(helpers.calculateProfessionalTax(25000, "Chennai")).toBe(195);
      expect(helpers.calculateProfessionalTax(35000, "Tamil Nadu")).toBe(210);
      expect(helpers.calculateProfessionalTax(50000, "Chennai")).toBe(235);
      expect(helpers.calculateProfessionalTax(70000, "Tamil Nadu")).toBe(250);
    });

    it("returns zero for Delhi", () => {
      expect(helpers.calculateProfessionalTax(50000, "Delhi")).toBe(0);
    });
  });

  describe("MockServer and Auth E2E Flow", () => {
    it("registers user, authenticates, enforces lockouts, and generates CSRF token", async () => {
      const emp = {
        name: "Test Developer",
        email: "dev@workforces.com",
        phone: "+91 99999 88888",
        role: "Employee",
        department: "Engineering",
        manager: "HR Admin",
        location: "Pune Office",
        dateOfJoining: "2026-03-15",
        dob: "1995-08-22",
        address: "Pune",
        nationality: "Indian",
        gender: "Male",
        maritalStatus: "Single",
        wage: 100000,
        bankName: "HDFC",
        accountNo: "9999",
        ifsc: "HDFC001",
        pan: "ABCDE1234F"
      };
      emp.id = helpers.generateEmployeeId(emp, []);
 
      const hr = {
        id: "HR001",
        name: "HR Admin",
        email: "hr@workforces.com",
        role: "HR",
        department: "People",
        manager: "",
        location: "Headquarters",
        dateOfJoining: "2026-01-01",
        wage: 150000
      };

      // 1. Bootstrap first HR, then register the employee with HR auth.
      const hrResult = await MockServer.registerUser(hr, "SecurePassword123!");
      const regResult = await MockServer.registerUser(
        emp,
        "SecurePassword123!",
        hrResult.token,
        hrResult.csrfToken
      );
      expect(regResult.token).toBeDefined();
      expect(regResult.employee.id).toBeDefined();
 
      // 2. Login Successfully
      const authResult = await MockServer.authenticate(regResult.employee.id, "SecurePassword123!");
      expect(authResult.token).toBeDefined();
      expect(authResult.employee.email).toBe("dev@workforces.com");
 
      // 3. Lockout enforcement on successive failed attempts
      const cryptoModule = await import("../src/crypto.js");
      let failedLimit = false;
      const username = regResult.employee.id.toLowerCase();
      
      for (let i = 0; i < 6; i++) {
        try {
          cryptoModule.checkRateLimit(username);
          cryptoModule.recordFailedAttempt(username);
        } catch (e) {
          if (e.message.includes("attempts") || e.message.includes("locked")) {
            failedLimit = true;
          }
        }
      }
      expect(failedLimit).toBe(true);
    });
  });

  describe("Audit trail logging", () => {
    it("saves audit logs and respects retention policies", () => {
      helpers.logAudit("CREATE", "employees", "EMP01", { name: "John" }, "system", "HR");
      
      let logs = helpers.getAuditLog();
      expect(logs.length).toBe(1);
      expect(logs[0].action).toBe("CREATE");
      expect(logs[0].entityType).toBe("employees");

      // Retention check
      localStorage.setItem("log_retention_days", "30");
      helpers.logAudit("UPDATE", "employees", "EMP01", { name: "John Doe" }, "system", "HR");
      
      logs = helpers.getAuditLog();
      expect(logs.length).toBe(2);
    });
  });
});
