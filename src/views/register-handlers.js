/**
 * Single registration point for view handlers referenced by data-wf-click / legacy onclick strings.
 */
import * as auth from "./auth.js";
import * as dashboard from "./dashboard.js";
import * as employees from "./employees.js";
import * as profile from "./profile.js";
import * as attendance from "./attendance.js";
import * as timeoff from "./timeoff.js";
import * as payroll from "./payroll.js";
import * as layout from "./layout.js";

const handlers = {
  ...layout,
  ...auth,
  ...dashboard,
  ...employees,
  ...profile,
  ...attendance,
  ...timeoff,
  ...payroll
};

export function registerViewHandlers() {
  if (typeof window === "undefined") return;
  for (const [name, fn] of Object.entries(handlers)) {
    if (typeof fn === "function") {
      window[name] = fn;
    }
  }
  window.selectedCalendarDate = timeoff.selectedCalendarDate;
}

export {
  auth,
  dashboard,
  employees,
  profile,
  attendance,
  timeoff,
  payroll,
  layout
};
