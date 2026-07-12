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
    id: "AUD" + Date.now() + Math.random().toString(36).substr(2, 4),
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

export function calculateProfessionalTax(monthlyGross, location = "") {
  const loc = String(location).toLowerCase();
  
  if (loc.includes("maharashtra") || loc.includes("mumbai") || loc.includes("pune")) {
    if (monthlyGross <= 7500) return 0;
    if (monthlyGross <= 10000) return 175;
    const isFeb = new Date().getMonth() === 1;
    return isFeb ? 250 : 200;
  }
  
  if (loc.includes("tamil nadu") || loc.includes("chennai")) {
    if (monthlyGross <= 12000) return 0;
    if (monthlyGross <= 21000) return 185;
    if (monthlyGross <= 30000) return 195;
    if (monthlyGross <= 45000) return 210;
    if (monthlyGross <= 60000) return 235;
    return 250;
  }
  
  if (loc.includes("telangana") || loc.includes("hyderabad")) {
    if (monthlyGross <= 15000) return 0;
    if (monthlyGross <= 20000) return 150;
    return 200;
  }
  
  if (loc.includes("delhi")) {
    return 0;
  }
  
  // Default: Karnataka (Headquarters / general)
  if (monthlyGross <= 15000) return 0;
  return 200;
}
window.calculateProfessionalTax = calculateProfessionalTax;

export function calculateTDS(annualGross, empData = {}) {
  const standardDeduction = 75000;
  const taxableIncome = Math.max(0, annualGross - standardDeduction);
  
  let annualTax = 0;
  if (taxableIncome <= 300000) annualTax = 0;
  else if (taxableIncome <= 600000) annualTax = (taxableIncome - 300000) * 0.05;
  else if (taxableIncome <= 900000) annualTax = 15000 + (taxableIncome - 600000) * 0.10;
  else if (taxableIncome <= 1200000) annualTax = 45000 + (taxableIncome - 900000) * 0.15;
  else if (taxableIncome <= 1500000) annualTax = 90000 + (taxableIncome - 1200000) * 0.20;
  else annualTax = 150000 + (taxableIncome - 1500000) * 0.30;
  
  const monthly = annualTax / 12;
  return { annual: annualTax, monthly };
}
window.calculateTDS = calculateTDS;

export function getSalaryBreakdown(wage, empData = {}) {
  const basic = wage * 0.5;
  const hra = basic * 0.4;
  const standard = wage * 0.1;
  const bonus = basic * 0.15;
  const lta = basic * 0.0833;
  const fixed = wage - (basic + hra + standard + bonus + lta);
  
  const pfCeiling = 15000;
  const employerPf = Math.min(basic, pfCeiling) * 0.12;
  const employeePf = Math.min(basic, pfCeiling) * 0.12;
  
  const esiCeiling = 21000;
  const employerEsi = wage <= esiCeiling ? wage * 0.0325 : 0;
  const employeeEsi = wage <= esiCeiling ? wage * 0.0075 : 0;
  
  const pt = calculateProfessionalTax(wage, empData.location || "");
  
  const yearsOfService = empData.dateOfJoining 
    ? Math.floor((new Date() - new Date(empData.dateOfJoining)) / (1000 * 60 * 60 * 24 * 365.25))
    : 0;
  const gratuity = (basic * 0.0481) * yearsOfService;
  
  const annualGross = wage * 12;
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
