import { getStore, getRouter } from './app-context.js';
import { MockServer } from "./server.js";
import { escapeHtml } from "./renderer.js";
import { registerStore } from "./app-context.js";

const STORE_DB_NAME = "workforces_store_db";
const STORE_DB_VERSION = 1;
let storeDb = null;

export const DEFAULT_ADMIN = {
  id: "ODIAD20260001",
  name: "HR Admin",
  email: "admin@odoo.com",
  phone: "+91 98765 43210",
  role: "HR",
  department: "Human Resources",
  manager: "N/A",
  location: "Headquarters, India",
  dateOfJoining: "2026-01-01",
  dob: "1990-05-15",
  address: "123 Odoo Avenue, Tech Park, Mumbai",
  nationality: "Indian",
  gender: "Female",
  maritalStatus: "Single",
  status: "Present",
  wage: 150000,
  bankName: "State Bank of India",
  accountNo: "12345678901",
  ifsc: "SBIN0001234",
  pan: "ABCDE1234F",
  ptoDays: 30,
  sickDays: 15,
  avatar: ""
};

export const INITIAL_EMPLOYEES = [
  DEFAULT_ADMIN,
  {
    id: "ODIJD20260002",
    name: "John Doe",
    email: "john.doe@odoo.com",
    phone: "+91 98765 00002",
    role: "Employee",
    department: "Engineering",
    manager: "HR Admin",
    location: "Pune Office",
    dateOfJoining: "2026-03-15",
    dob: "1995-08-22",
    address: "Flat 402, Green Valley, Pune",
    nationality: "Indian",
    gender: "Male",
    maritalStatus: "Married",
    status: "Present",
    wage: 80000,
    bankName: "HDFC Bank",
    accountNo: "98765432101",
    ifsc: "HDFC0000123",
    pan: "FGHIJ5678K",
    ptoDays: 30,
    sickDays: 15,
    avatar: ""
  },
  {
    id: "ODIAS20260003",
    name: "Alice Smith",
    email: "alice.smith@odoo.com",
    phone: "+91 98765 00003",
    role: "Employee",
    department: "Marketing",
    manager: "HR Admin",
    location: "Mumbai Office",
    dateOfJoining: "2026-04-01",
    dob: "1997-12-10",
    address: "7A Residency, Bandra, Mumbai",
    nationality: "Indian",
    gender: "Female",
    maritalStatus: "Single",
    status: "Leave",
    wage: 65000,
    bankName: "ICICI Bank",
    accountNo: "11223344556",
    ifsc: "ICIC0000567",
    pan: "LMNOP9012Q",
    ptoDays: 30,
    sickDays: 15,
    avatar: ""
  }
];

export const INITIAL_ATTENDANCE = [
  {
    id: "ATT001",
    employeeId: "ODIJD20260002",
    date: "2026-07-03",
    checkIn: "09:00:00",
    checkOut: "18:00:00",
    workHours: 9.00,
    extraHours: 1.00,
    status: "Present"
  },
  {
    id: "ATT002",
    employeeId: "ODIAS20260003",
    date: "2026-07-03",
    checkIn: "",
    checkOut: "",
    workHours: 0.00,
    extraHours: 0.00,
    status: "Leave"
  }
];

export const INITIAL_LEAVES = [
  {
    id: "LV001",
    employeeId: "ODIAS20260003",
    employeeName: "Alice Smith",
    leaveType: "Paid Time Off",
    startDate: "2026-07-03",
    endDate: "2026-07-04",
    remarks: "Family emergency",
    status: "Approved",
    attachmentName: "",
    attachmentData: "",
    comment: "Approved by HR Admin"
  }
];

function initStoreDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(STORE_DB_NAME, STORE_DB_VERSION);
    request.onerror = (e) => reject(e.target.error);
    request.onsuccess = (e) => {
      storeDb = e.target.result;
      resolve(storeDb);
    };
    request.onupgradeneeded = (e) => {
      const activeDb = e.target.result;
      if (!activeDb.objectStoreNames.contains("state")) {
        activeDb.createObjectStore("state", { keyPath: "key" });
      }
      if (!activeDb.objectStoreNames.contains("audit_log")) {
        const auditStore = activeDb.createObjectStore("audit_log", { keyPath: "id", autoIncrement: true });
        auditStore.createIndex("timestamp", "timestamp", { unique: false });
        auditStore.createIndex("entityType", "entityType", { unique: false });
        auditStore.createIndex("entityId", "entityId", { unique: false });
      }
    };
  });
}

function sanitizeForStorage(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") {
    if (window.DOMPurify) {
      return window.DOMPurify.sanitize(obj, { ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i });
    }
    // Fallback if DOMPurify is not loaded
    return obj.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
              .replace(/on\w+\s*=/gi, "data-on=")
              .replace(/javascript:/gi, "about:blank");
  }
  if (Array.isArray(obj)) return obj.map(sanitizeForStorage);
  if (typeof obj === "object") {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeForStorage(value);
    }
    return sanitized;
  }
  return obj;
}

export class Store {
  constructor() {
    this.state = Store.createEmptyState();
    this.ready = this.initStore().then(async () => {
      await this.loadState();
      if (this.state.users.length === 0) {
        this.state.users = [
          { email: "admin@odoo.com", password: "bc78e58d55cde1346e68f8e5fe588dedf62fa457aa646a500a53347faff6ee24", employeeId: "ODIAD20260001", role: "HR" },
          { email: "john.doe@odoo.com", password: "ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f", employeeId: "ODIJD20260002", role: "Employee" },
          { email: "alice.smith@odoo.com", password: "ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f", employeeId: "ODIAS20260003", role: "Employee" }
        ];
        this.state.employees = INITIAL_EMPLOYEES;
        this.state.attendance = INITIAL_ATTENDANCE;
        this.state.timeOff = INITIAL_LEAVES;
        this.state.leaveConfig = {
          annualPtoAllotment: 30,
          annualSickAllotment: 15,
          accrualSchedule: "Annual",
          maxCarryForward: 10
        };
        await this.saveState();
      }
    });
  }

  static createEmptyState() {
    return {
      employees: [],
      attendance: [],
      timeOff: [],
      users: [],
      currentSession: null,
      leaveConfig: {
        annualPtoAllotment: 30,
        annualSickAllotment: 15,
        accrualSchedule: "Annual",
        maxCarryForward: 10
      }
    };
  }

  async initStore() {
    await initStoreDB();
  }

  async loadState() {
    if (!storeDb) await this.initStore();
    return new Promise((resolve) => {
      const tx = storeDb.transaction("state", "readonly");
      const store = tx.objectStore("state");
      const request = store.get("app_state");
      request.onsuccess = () => {
        this.state = request.result?.value || Store.createEmptyState();
        resolve();
      };
      request.onerror = () => {
        this.state = Store.createEmptyState();
        resolve();
      };
    });
  }

  async saveState() {
    if (!storeDb) await this.initStore();
    const sanitized = sanitizeForStorage(this.state);
    try {
      localStorage.setItem("workforces_state", JSON.stringify({
        currentSession: sanitized.currentSession ? {
          employeeId: sanitized.currentSession.employeeId || null,
          token: sanitized.currentSession.token || null,
          csrfToken: sanitized.currentSession.csrfToken || null
        } : null
      }));
    } catch (e) {
      console.warn("Could not mirror sync session to localStorage:", e);
    }
    return new Promise((resolve, reject) => {
      const tx = storeDb.transaction("state", "readwrite");
      const store = tx.objectStore("state");
      store.put({ key: "app_state", value: sanitized, updatedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  getCurrentUser() {
    if (!this.state.currentSession) return null;
    return this.state.employees.find(e => e.id === this.state.currentSession.employeeId);
  }

  getEmployee(id) {
    return this.state.employees.find(e => e.id === id);
  }

  updateEmployee(id, updatedFields, actorId, actorRole) {
    const idx = this.state.employees.findIndex(e => e.id === id);
    if (idx !== -1) {
      const oldValues = { ...this.state.employees[idx] };
      const changes = {};
      for (const [key, value] of Object.entries(updatedFields)) {
        if (oldValues[key] !== value) {
          changes[key] = { old: oldValues[key], new: value };
        }
      }
      this.state.employees[idx] = { ...this.state.employees[idx], ...updatedFields };
      this.saveState();
      
      if (Object.keys(changes).length > 0) {
        window.logAudit?.("UPDATE", "employee", id, changes, actorId, actorRole);
      }
      
      return true;
    }
    return false;
  }

  async addEmployee(emp, password) {
    const generatedId = window.generateEmployeeId(emp, this.state.employees);
    emp.id = generatedId;
    emp.status = "Absent";
    
    const config = this.state.leaveConfig || { annualPtoAllotment: 30, annualSickAllotment: 15 };
    emp.ptoDays = config.annualPtoAllotment;
    emp.sickDays = config.annualSickAllotment;
    
    const currentSession = this.state.currentSession;
    const result = await MockServer.registerUser(
      emp,
      password,
      currentSession?.token || null,
      currentSession?.csrfToken || null
    );

    const serverEmployees = await MockServer.getEmployees(currentSession?.token || result.token);
    this.state.employees = serverEmployees;
    await this.saveState();
    
    window.logAudit?.("CREATE", "employee", generatedId, { 
      name: { old: null, new: emp.name },
      email: { old: null, new: emp.email },
      role: { old: null, new: emp.role },
      department: { old: null, new: emp.department }
    }, result.employee?.id || "system", result.employee?.role || "HR");
    
    return emp;
  }

  getAttendanceToday(empId) {
    const todayStr = window.getTodayString?.() || new Date().toISOString().split("T")[0];
    return this.state.attendance.find(a => a.employeeId === empId && a.date === todayStr);
  }

  checkIn(empId) {
    const todayStr = window.getTodayString?.() || new Date().toISOString().split("T")[0];
    const nowTime = window.getNowTimeString?.() || new Date().toTimeString().split(" ")[0];
    
    const existing = this.getAttendanceToday(empId);
    if (existing) return existing;

    const newRecord = {
      id: "ATT" + Date.now(),
      employeeId: empId,
      date: todayStr,
      checkIn: nowTime,
      checkOut: "",
      workHours: 0.00,
      extraHours: 0.00,
      status: "Present"
    };
    
    this.state.attendance.push(newRecord);
    this.updateEmployee(empId, { status: "Present" }, empId, "Employee");
    this.saveState();
    
    window.logAudit?.("CHECK_IN", "attendance", newRecord.id, {
      checkIn: { old: null, new: nowTime },
      date: { old: null, new: todayStr }
    }, empId, "Employee");
    
    return newRecord;
  }

  checkOut(empId) {
    const record = this.getAttendanceToday(empId);
    if (!record || record.checkOut) return record;

    const checkOutTime = window.getNowTimeString?.() || new Date().toTimeString().split(" ")[0];
    const oldCheckOut = record.checkOut;
    const oldWorkHours = record.workHours;
    const oldExtraHours = record.extraHours;
    record.checkOut = checkOutTime;

    const diffMs = window.parseTimeToMs(checkOutTime) - window.parseTimeToMs(record.checkIn);
    const hours = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(2));
    record.workHours = hours;
    record.extraHours = hours > 8.00 ? parseFloat((hours - 8.00).toFixed(2)) : 0.00;

    this.saveState();
    
    window.logAudit?.("CHECK_OUT", "attendance", record.id, {
      checkOut: { old: oldCheckOut, new: checkOutTime },
      workHours: { old: oldWorkHours, new: record.workHours },
      extraHours: { old: oldExtraHours, new: record.extraHours }
    }, empId, "Employee");
    
    return record;
  }

  applyLeave(leaveRequest, actorId, actorRole) {
    leaveRequest.id = "LV" + Date.now();
    leaveRequest.status = "Pending";
    leaveRequest.comment = "";
    this.state.timeOff.push(leaveRequest);
    this.saveState();
    
    window.logAudit?.("CREATE", "timeoff", leaveRequest.id, {
      employeeId: { old: null, new: leaveRequest.employeeId },
      leaveType: { old: null, new: leaveRequest.leaveType },
      startDate: { old: null, new: leaveRequest.startDate },
      endDate: { old: null, new: leaveRequest.endDate },
      status: { old: null, new: "Pending" }
    }, actorId, actorRole);
  }

  updateLeaveStatus(leaveId, status, comment, actorId, actorRole) {
    const leave = this.state.timeOff.find(l => l.id === leaveId);
    if (leave) {
      const oldStatus = leave.status;
      const oldComment = leave.comment;
      leave.status = status;
      leave.comment = comment;
      
      if (status === "Approved") {
        const emp = this.getEmployee(leave.employeeId);
        const days = typeof leave.days === 'number' ? leave.days : window.calculateDaysBetween(leave.startDate, leave.endDate);
        const oldPtoDays = emp?.ptoDays;
        const oldSickDays = emp?.sickDays;
        
        if (emp) {
          if (leave.leaveType === "Paid Time Off") {
            emp.ptoDays = Math.max(0, emp.ptoDays - days);
          } else if (leave.leaveType === "Sick Leave") {
            emp.sickDays = Math.max(0, emp.sickDays - days);
          }
          const todayStr = window.getTodayString?.() || new Date().toISOString().split("T")[0];
          if (todayStr >= leave.startDate && todayStr <= leave.endDate) {
            emp.status = "Leave";
          }
          this.updateEmployee(emp.id, emp, actorId, actorRole);
        }
        
        if (emp) {
          window.logAudit?.("APPROVE", "timeoff", leaveId, {
            status: { old: oldStatus, new: status },
            comment: { old: oldComment, new: comment },
            ptoDays: { old: oldPtoDays, new: emp.ptoDays },
            sickDays: { old: oldSickDays, new: emp.sickDays }
          }, actorId, actorRole);
        } else {
          window.logAudit?.("APPROVE", "timeoff", leaveId, {
            status: { old: oldStatus, new: status },
            comment: { old: oldComment, new: comment }
          }, actorId, actorRole);
        }
      } else if (status === "Rejected") {
        window.logAudit?.("REJECT", "timeoff", leaveId, {
          status: { old: oldStatus, new: status },
          comment: { old: oldComment, new: comment }
        }, actorId, actorRole);
      }
      
      this.saveState();
      return true;
    }
    return false;
  }
}

window.Store = Store;
const store = new Store();
registerStore(store);
// getStore() = store; removed
window.escapeHtml = escapeHtml;
