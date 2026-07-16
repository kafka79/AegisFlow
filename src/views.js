export {
  ICONS,
  getSidebarHTML,
  getHeaderHTML,
  toggleProfileDropdown,
  handleLogout,
  getModalHTML,
  showModal,
  closeModal
} from "./views/layout.js";

export {
  renderLoginView,
  handleLoginSubmit,
  renderSignupView,
  handleSignupSubmit
} from "./views/auth.js";

export {
  renderDashboardView,
  startDashboardClock,
  handleClockTrigger,
  clockInterval
} from "./views/dashboard.js";

export {
  renderEmployeesView,
  getEmployeeCardHTML,
  filterEmployees,
  showOnboardModal,
  handleOnboardSubmit
} from "./views/employees.js";

export {
  renderProfileView,
  switchProfileTab,
  triggerAvatarUpload,
  handleAvatarChange,
  handleProfileUpdate,
  recalculateSalaryDisplay,
  handleBankUpdate,
  handlePasswordUpdate
} from "./views/profile.js";

export {
  renderAttendanceView,
  filterAdminAttendance
} from "./views/attendance.js";

export {
  selectedCalendarDate,
  renderTimeOffView,
  changeCalendarMonth,
  renderCalendarDays,
  showApplyLeaveModal,
  toggleHalfDayOption,
  calculateRequestedDays,
  handleLeaveSubmit,
  showApproveCommentModal,
  submitLeaveDecision
} from "./views/timeoff.js";

export {
  renderPayrollView,
  calculateMonthlyPayroll,
  showPayslipModal
} from "./views/payroll.js";

// Component system exports
export {
  Component,
  componentRegistry,
  registerComponent,
  getComponent,
  createConditionalComponent,
  ListComponent,
  FormComponent,
  ModalComponent,
  CardComponent,
  TableComponent,
  createBadge,
  createButton,
  createInput,
  createSelect,
  createAlert,
  createSpinner,
  createEmptyState
} from "./components.js";

import { registerViewHandlers } from "./views/register-handlers.js";

registerViewHandlers();
