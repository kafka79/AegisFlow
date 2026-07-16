import fs from "node:fs";
import path from "node:path";

const dir = "src/views";
const commonImport = `import {
  getTodayString, getNowTimeString, parseTimeToMs, calculateDaysBetween,
  validateIdFormat, generateEmployeeId, logAudit, getAuditLog,
  calculateProfessionalTax, calculateTDS, getSalaryBreakdown, isHoliday, NATIONAL_HOLIDAYS
} from "../helpers.js";
import { escapeHtml } from "../renderer.js";
import { getStore, getRouter } from "../app-context.js";
import { ICONS, getSidebarHTML, getHeaderHTML, showModal, closeModal } from "./layout.js";
import { showInlineAlert, selectedCalendarDate } from "./shared.js";
export { selectedCalendarDate } from "./shared.js";
`;

const skip = new Set(["layout.js", "icons.js", "shared.js", "register-handlers.js", "index.js"]);

for (const file of fs.readdirSync(dir)) {
  if (!file.endsWith(".js") || skip.has(file)) continue;
  let content = fs.readFileSync(path.join(dir, file), "utf8");
  content = content.replace(
    /import \{[\s\S]*?\} from "\.\/layout\.js";[\s\S]*?export let selectedCalendarDate = new Date\(\);\n\n/,
    `${commonImport}\n`
  );
  content = content.replace(/from "\.\/server\.js"/g, 'from "../server.js"');
  content = content.replace(/^window\.\w+ = \w+;\n/gm, "");
  fs.writeFileSync(path.join(dir, file), content);
}

console.log("views cleaned");
