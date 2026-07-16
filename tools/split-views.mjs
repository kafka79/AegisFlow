import fs from "node:fs";

const lines = fs.readFileSync("src/views.js", "utf8").split("\n");

const header = `import {
  getTodayString, getNowTimeString, parseTimeToMs, calculateDaysBetween,
  validateIdFormat, generateEmployeeId, logAudit, getAuditLog,
  calculateProfessionalTax, calculateTDS, getSalaryBreakdown, isHoliday, NATIONAL_HOLIDAYS
} from "../helpers.js";
import { escapeHtml } from "../renderer.js";
import { getStore, getRouter } from "../app-context.js";
import { ICONS, getSidebarHTML, getHeaderHTML, showModal, closeModal } from "./layout.js";

function showInlineAlert(container, message, type = "error") {
  if (!container) return;
  container.innerHTML = "";
  const alert = document.createElement("div");
  alert.className = \`alert-banner alert-\${type}\`;
  const span = document.createElement("span");
  span.textContent = message;
  alert.appendChild(span);
  container.appendChild(alert);
}

export let selectedCalendarDate = new Date();
`;

const sections = [
  ["auth.js", 24, 199],
  ["dashboard.js", 200, 473],
  ["employees.js", 474, 693],
  ["profile.js", 694, 1107],
  ["attendance.js", 1108, 1266],
  ["timeoff.js", 1267, 1694],
  ["payroll.js", 1695, 1969]
];

for (const [file, start, end] of sections) {
  const body = lines.slice(start, end).join("\n");
  fs.writeFileSync(`src/views/${file}`, `${header}\n${body}\n`);
}

console.log("views split complete");
