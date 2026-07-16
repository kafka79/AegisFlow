export const NATIONAL_HOLIDAYS = {
  "2026-01-26": "Republic Day",
  "2026-03-06": "Holi",
  "2026-04-15": "Good Friday",
  "2026-05-01": "May Day",
  "2026-08-15": "Independence Day",
  "2026-10-02": "Gandhi Jayanti",
  "2026-10-22": "Dussehra",
  "2026-11-08": "Diwali",
  "2026-12-25": "Christmas Day"
};

export function isHoliday(dateStr) {
  return dateStr in NATIONAL_HOLIDAYS;
}
window.isHoliday = isHoliday;

export function getTodayString() {
  const now = new Date();
  return now.toISOString().split("T")[0];
}
window.getTodayString = getTodayString;

export function getNowTimeString() {
  const now = new Date();
  return now.toTimeString().split(" ")[0];
}
window.getNowTimeString = getNowTimeString;

export function parseTimeToMs(timeStr) {
  const [h, m, s] = timeStr.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, s, 0);
  return d.getTime();
}
window.parseTimeToMs = parseTimeToMs;

export function calculateDaysBetween(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  const diff = e - s;
  return Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
}
window.calculateDaysBetween = calculateDaysBetween;

export function validateIdFormat(format) {
  if (typeof format !== "string" || !format.trim()) return false;
  if (!format.includes("{serial}") && !format.includes("{uuid}")) return false;
  const openBraces = (format.match(/\{/g) || []).length;
  const closeBraces = (format.match(/\}/g) || []).length;
  if (openBraces !== closeBraces) return false;
  const placeholders = format.match(/\{[^}]+\}/g) || [];
  const allowed = ["{initials}", "{year}", "{serial}", "{uuid}"];
  for (const p of placeholders) {
    if (!allowed.includes(p)) return false;
  }
  return true;
}
window.validateIdFormat = validateIdFormat;

export function generateEmployeeId(emp, existingEmployees) {
  let format = localStorage.getItem("employee_id_format") || "ODI{initials}{year}{serial}";
  if (!validateIdFormat(format)) {
    format = "ODI{initials}{year}{serial}";
  }
  const year = new Date(emp.dateOfJoining).getFullYear();
  const nameParts = emp.name.trim().split(" ");
  const initials = ((nameParts[0]?.[0] || "E") + (nameParts[nameParts.length - 1]?.[0] || "X")).toUpperCase();
  
  const yearEmps = existingEmployees.filter(e => new Date(e.dateOfJoining).getFullYear() === year);
  const serial = String(yearEmps.length + 1).padStart(4, "0");
  
  return format
    .replace("{initials}", initials)
    .replace("{year}", year)
    .replace("{serial}", serial)
    .replace("{uuid}", crypto.randomUUID().replace(/-/g, "").substring(0, 8).toUpperCase());
}
window.generateEmployeeId = generateEmployeeId;

export function logAudit(action, entityType, entityId, changes, actorId, actorRole) {
  const auditLog = JSON.parse(localStorage.getItem("workforces_audit_log") || "[]");
  auditLog.unshift({
    id: "AUD_" + crypto.randomUUID().replace(/-/g, ""),
    timestamp: Date.now(),
    action,
    entityType,
    entityId,
    changes,
    actor: { id: actorId, role: actorRole }
  });
  
  const retentionPolicy = localStorage.getItem("log_retention_days") || "90";
  const retentionMs = parseInt(retentionPolicy, 10) * 24 * 60 * 60 * 1000;
  const cutoffTime = Date.now() - retentionMs;
  
  const filteredLog = auditLog.filter(entry => entry.timestamp >= cutoffTime);
  if (filteredLog.length > 10000) filteredLog.length = 10000;
  
  localStorage.setItem("workforces_audit_log", JSON.stringify(filteredLog));
}
window.logAudit = logAudit;

export function getAuditLog(filters = {}) {
  const auditLog = JSON.parse(localStorage.getItem("workforces_audit_log") || "[]");
  return auditLog.filter(entry => {
    if (filters.entityType && entry.entityType !== filters.entityType) return false;
    if (filters.entityId && entry.entityId !== filters.entityId) return false;
    if (filters.actorId && entry.actor.id !== filters.actorId) return false;
    if (filters.startDate && entry.timestamp < new Date(filters.startDate).getTime()) return false;
    if (filters.endDate && entry.timestamp > new Date(filters.endDate).getTime()) return false;
    return true;
  });
}
window.getAuditLog = getAuditLog;

function getDefaultPayrollConfig() {
  return {
    pfCeiling: 15000,
    pfRate: 0.12,
    esiCeiling: 21000,
    esiEmployerRate: 0.0325,
    esiEmployeeRate: 0.0075,
    standardDeduction: 75000,
    professionalTaxSlabs: {
      maharashtra: [
        { limit: 7500, rate: 0 },
        { limit: 10000, rate: 175 },
        { limit: null, rate: 200, febRate: 250 }
      ],
      tamil_nadu: [
        { limit: 12000, rate: 0 },
        { limit: 21000, rate: 185 },
        { limit: 30000, rate: 195 },
        { limit: 45000, rate: 210 },
        { limit: 60000, rate: 235 },
        { limit: null, rate: 250 }
      ],
      telangana: [
        { limit: 15000, rate: 0 },
        { limit: 20000, rate: 150 },
        { limit: null, rate: 200 }
      ],
      delhi: [
        { limit: null, rate: 0 }
      ],
      default: [
        { limit: 15000, rate: 0 },
        { limit: null, rate: 200 }
      ]
    },
    tdsSlabs: [
      { limit: 300000, rate: 0, base: 0 },
      { limit: 600000, rate: 0.05, base: 0 },
      { limit: 900000, rate: 0.10, base: 15000 },
      { limit: 1200000, rate: 0.15, base: 45000 },
      { limit: 1500000, rate: 0.20, base: 90000 },
      { limit: null, rate: 0.30, base: 150000 }
    ],
    salaryStructure: {
      basicPercent: 0.5,
      hraPercentOfBasic: 0.4,
      standardPercent: 0.1,
      bonusPercentOfBasic: 0.15,
      ltaPercentOfBasic: 0.0833
    }
  };
}

let payrollConfigCache = (() => {
  try {
    const cached = typeof localStorage !== "undefined" ? localStorage.getItem("payroll_config") : null;
    return cached ? JSON.parse(cached) : getDefaultPayrollConfig();
  } catch {
    return getDefaultPayrollConfig();
  }
})();

export function getPayrollConfigSync() {
  if (!payrollConfigCache) payrollConfigCache = getDefaultPayrollConfig();
  return payrollConfigCache;
}

export async function fetchAndCachePayrollConfig() {
  try {
    const { MockServer } = await import("./server.js");
    const config = await MockServer.getPayrollConfig();
    if (config) {
      payrollConfigCache = config;
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("payroll_config", JSON.stringify(config));
      }
    }
  } catch (err) {
    console.warn("[helpers] Failed to fetch payroll config from server, using local/default:", err);
  }
}

function getLocationKey(location) {
  const loc = String(location).toLowerCase();
  if (loc.includes("maharashtra") || loc.includes("mumbai") || loc.includes("pune")) return "maharashtra";
  if (loc.includes("tamil nadu") || loc.includes("chennai")) return "tamil_nadu";
  if (loc.includes("telangana") || loc.includes("hyderabad")) return "telangana";
  if (loc.includes("delhi")) return "delhi";
  return "default";
}

function calculateProfessionalTaxFromSlabs(monthlyGross, slabs, isFebruary = false) {
  for (const slab of slabs) {
    if (slab.limit === null || monthlyGross <= slab.limit) {
      if (isFebruary && slab.febRate !== undefined) {
        return slab.febRate;
      }
      return slab.rate;
    }
  }
  const lastSlab = slabs[slabs.length - 1];
  if (isFebruary && lastSlab?.febRate !== undefined) {
    return lastSlab.febRate;
  }
  return lastSlab?.rate || 0;
}

export function calculateProfessionalTax(monthlyGross, location = "") {
  const config = getPayrollConfigSync();
  const locKey = getLocationKey(location);
  const slabs = config.professionalTaxSlabs?.[locKey] || config.professionalTaxSlabs?.default || getDefaultPayrollConfig().professionalTaxSlabs.default;
  const isFeb = new Date().getMonth() === 1;
  return calculateProfessionalTaxFromSlabs(monthlyGross, slabs, isFeb);
}
window.calculateProfessionalTax = calculateProfessionalTax;

export function calculateTDS(annualGross, empData = {}) {
  const config = getPayrollConfigSync();
  const standardDeduction = config.standardDeduction ?? 75000;
  const taxableIncome = Math.max(0, annualGross - standardDeduction);
  
  let annualTax = 0;
  const slabs = config.tdsSlabs || getDefaultPayrollConfig().tdsSlabs;
  
  for (const slab of slabs) {
    if (slab.limit === null || taxableIncome <= slab.limit) {
      annualTax = slab.base + (taxableIncome - (slabs[slabs.indexOf(slab) - 1]?.limit || 0)) * slab.rate;
      break;
    }
  }
  
  const monthly = annualTax / 12;
  return { annual: annualTax, monthly };
}
window.calculateTDS = calculateTDS;

export function getSalaryBreakdown(wage, empData = {}) {
  const config = getPayrollConfigSync();
  const salaryStructure = config.salaryStructure || getDefaultPayrollConfig().salaryStructure;
  
  const basic = wage * (salaryStructure.basicPercent ?? 0.5);
  const hra = basic * (salaryStructure.hraPercentOfBasic ?? 0.4);
  const standard = wage * (salaryStructure.standardPercent ?? 0.1);
  const bonus = basic * (salaryStructure.bonusPercentOfBasic ?? 0.15);
  const lta = basic * (salaryStructure.ltaPercentOfBasic ?? 0.0833);
  const fixed = wage - (basic + hra + standard + bonus + lta);
  
  const pfCeiling = config.pfCeiling ?? 15000;
  const pfRate = config.pfRate ?? 0.12;
  const employerPf = Math.min(basic, pfCeiling) * pfRate;
  const employeePf = Math.min(basic, pfCeiling) * pfRate;
  
  const esiCeiling = config.esiCeiling ?? 21000;
  const esiEmployerRate = config.esiEmployerRate ?? 0.0325;
  const esiEmployeeRate = config.esiEmployeeRate ?? 0.0075;
  const employerEsi = wage <= esiCeiling ? wage * esiEmployerRate : 0;
  const employeeEsi = wage <= esiCeiling ? wage * esiEmployeeRate : 0;
  
  const pt = calculateProfessionalTax(wage, empData.location || "");
  
  const yearsOfService = empData.dateOfJoining 
    ? Math.floor((new Date() - new Date(empData.dateOfJoining)) / (1000 * 60 * 60 * 24 * 365.25))
    : 0;
  const gratuity = (basic * 0.0481) * yearsOfService;
  
  const annualGross = (empData.wage || wage) * 12;
  const tds = calculateTDS(annualGross, empData);
  
  const totalDeductions = employeePf + (employeeEsi || 0) + pt + (tds.monthly || 0);
  const netSalary = wage - totalDeductions;

  return {
    basic,
    hra,
    standard,
    bonus,
    lta,
    fixed,
    employerPf,
    employeePf,
    employerEsi,
    employeeEsi,
    pt,
    gratuity,
    tds,
    totalDeductions,
    netSalary,
    pfCeiling,
    esiCeiling,
    yearsOfService
  };
}
window.getSalaryBreakdown = getSalaryBreakdown;

export function clearPayrollConfigCache() {
  payrollConfigCache = null;
}

/**
 * A tagged template literal for HTML that automatically escapes interpolated string values.
 * This prevents XSS attacks when constructing HTML strings.
 */
export function html(strings, ...values) {
  const escapeHTML = (str) => {
    if (typeof str !== 'string') return str;
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };

  return strings.reduce((result, str, i) => {
    const value = values[i - 1];
    let safeValue = value;
    if (Array.isArray(value)) {
      safeValue = value.join(''); // Assume array elements are already safe (e.g. nested html`` calls)
    } else if (value && value.__htmlSafe) {
      safeValue = value.value; // Bypass for intentionally safe HTML
    } else if (value !== null && value !== undefined) {
      safeValue = escapeHTML(String(value));
    } else {
      safeValue = '';
    }
    return result + safeValue + str;
  });
}
window.html = html;
