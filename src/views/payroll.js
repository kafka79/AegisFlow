import {
  getTodayString, getNowTimeString, parseTimeToMs, calculateDaysBetween,
  validateIdFormat, generateEmployeeId, logAudit, getAuditLog,
  calculateProfessionalTax, calculateTDS, getSalaryBreakdown, isHoliday, NATIONAL_HOLIDAYS
} from "../helpers.js";
import { escapeHtml } from "../renderer.js";
import { getStore, getRouter } from "../app-context.js";
import { ICONS, getSidebarHTML, getHeaderHTML, showModal, closeModal } from "./layout.js";
import { showInlineAlert, selectedCalendarDate } from "./shared.js";
export { selectedCalendarDate } from "./shared.js";

export function renderPayrollView() {
  const user = getStore().getCurrentUser();
  const sidebarHTML = getSidebarHTML("payroll");
  const headerHTML = getHeaderHTML("Payroll & compensation");

  const isAdmin = user.role === "HR";
  let payrollContent = "";

  if (isAdmin) {
    payrollContent = `
      <div class="animate-fade">
        <h3 style="margin-bottom: 20px; font-weight: 600;">Workforce Payroll Calculator</h3>
        <div class="alert-banner alert-success" style="margin-bottom: 24px;">
          <span><strong>Note:</strong> Working days calculation automatically excludes national holidays and weekends. Unpaid leaves or absences reduce payable days pro-rated by working days.</span>
        </div>

        <div class="data-table-container glass">
          <table class="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Employee Name</th>
                <th>Base Monthly</th>
                <th>Payable / Working Days</th>
                <th>Net Salary Payout</th>
                <th>Bank Details</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${getStore().state.employees.map(emp => {
                const calc = calculateMonthlyPayroll(emp);
                return `
                  <tr>
                    <td style="font-family: var(--font-mono); font-size: 0.85rem;">${emp.id}</td>
                    <td><strong>${emp.name}</strong></td>
                    <td>₹${emp.wage}</td>
                    <td><strong>${calc.payableDays} / ${calc.monthDays}</strong> Days</td>
                    <td style="color: var(--status-present); font-weight: 700;">₹${calc.payout}</td>
                    <td style="font-size: 0.85rem; color: var(--text-muted);">
                      ${emp.bankName !== 'TBD' ? `${emp.bankName} - ${emp.accountNo}` : '<span style="color: var(--status-absent);">Missing Banking Fields</span>'}
                    </td>
                    <td>
                      <button class="btn btn-primary btn-sm" onclick="showPayslipModal('${emp.id}')">View Payslip</button>
                    </td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
        
        <h3 style="margin-top: 32px; margin-bottom: 20px; font-weight: 600;">Statutory Reports</h3>
        <div class="dashboard-grid" style="grid-template-columns: repeat(3, 1fr); margin-bottom: 24px;">
          <div class="info-card glass">
            <div class="info-card-header">
              <span>Form 16 (TDS)</span>
            </div>
            <div class="info-card-footer" style="margin-top: 12px;">
              <button class="btn btn-secondary btn-sm" onclick="window.showToast('Generating Form 16 PDF...', 'info')">Generate Annual Form 16</button>
            </div>
          </div>
          <div class="info-card glass">
            <div class="info-card-header">
              <span>PF ECR Challan</span>
            </div>
            <div class="info-card-footer" style="margin-top: 12px;">
              <button class="btn btn-secondary btn-sm" onclick="window.showToast('Exporting PF ECR text file...', 'info')">Export Monthly PF ECR</button>
            </div>
          </div>
          <div class="info-card glass">
            <div class="info-card-header">
              <span>PT Return</span>
            </div>
            <div class="info-card-footer" style="margin-top: 12px;">
              <button class="btn btn-secondary btn-sm" onclick="window.showToast('Generating PT Return report...', 'info')">Export PT Return</button>
            </div>
          </div>
        </div>
      </div>
    `;
  } else {
    const calc = calculateMonthlyPayroll(user);

    payrollContent = `
      <div class="animate-fade" style="max-width: 800px; margin: 0 auto;">
        <div class="glass" style="padding: 40px; border-left: 6px solid var(--accent);">
          <div style="display: flex; justify-content: space-between; border-bottom: 2px solid var(--border-light); padding-bottom: 20px; margin-bottom: 24px;">
            <div>
              <h2 style="font-weight: 700; color: var(--accent);">SALARY SLIP</h2>
              <span style="font-size: 0.9rem; color: var(--text-muted);">For the month of ${new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
            </div>
            <div style="text-align: right;">
              <h3 style="font-weight: 700;">WorkForces</h3>
              <span style="font-size: 0.8rem; color: var(--text-dim);">${user.location}</span>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 32px; font-size: 0.9rem;">
            <div>
              <div style="margin-bottom: 6px;"><span style="color: var(--text-muted);">Employee Name:</span> <strong>${user.name}</strong></div>
              <div style="margin-bottom: 6px;"><span style="color: var(--text-muted);">Designation:</span> ${user.role}</div>
              <div><span style="color: var(--text-muted);">Department:</span> ${user.department}</div>
            </div>
            <div style="text-align: right;">
              <div style="margin-bottom: 6px;"><span style="color: var(--text-muted);">Employee ID:</span> <strong style="font-family: var(--font-mono);">${user.id}</strong></div>
              <div style="margin-bottom: 6px;"><span style="color: var(--text-muted);">Payable / Working Days:</span> <strong>${calc.payableDays} / ${calc.monthDays}</strong></div>
              <div><span style="color: var(--text-muted);">Bank:</span> ${user.bankName} (${user.accountNo})</div>
            </div>
          </div>

          <div class="salary-breakdown-box">
            <div class="salary-group">
              <div class="salary-group-title">Earnings (Pro-rated)</div>
              <div class="salary-row">
                <span class="salary-label">Basic Salary</span>
                <span class="salary-val">₹${calc.breakdown.basic}</span>
              </div>
              <div class="salary-row">
                <span class="salary-label">HRA Allowance</span>
                <span class="salary-val">₹${calc.breakdown.hra}</span>
              </div>
              <div class="salary-row">
                <span class="salary-label">Standard Allowance</span>
                <span class="salary-val">₹${calc.breakdown.standard}</span>
              </div>
              <div class="salary-row">
                <span class="salary-label">Performance Bonus</span>
                <span class="salary-val">₹${calc.breakdown.bonus}</span>
              </div>
              <div class="salary-row">
                <span class="salary-label">LTA Allowance</span>
                <span class="salary-val">₹${calc.breakdown.lta}</span>
              </div>
              <div class="salary-row">
                <span class="salary-label">Fixed Allowance</span>
                <span class="salary-val">₹${calc.breakdown.fixed}</span>
              </div>
            </div>

            <div class="salary-group">
              <div class="salary-group-title">Deductions</div>
              <div class="salary-row">
                <span class="salary-label">Employee Provident Fund (12%)</span>
                <span class="salary-val deduct">₹${calc.breakdown.employeePf}</span>
              </div>
              <div class="salary-row">
                <span class="salary-label">Professional Tax (PT)</span>
                <span class="salary-val deduct">₹${calc.breakdown.pt}</span>
              </div>
              <div class="salary-row">
                <span class="salary-label">Unpaid Absences Payout Cut</span>
                <span class="salary-val deduct" style="font-weight: 700;">₹${calc.unpaidDeduction}</span>
              </div>

              <div style="border-top: 1px solid var(--border-light); margin-top: 24px; padding-top: 16px; text-align: right;">
                <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 4px;">NET MONTHLY DISBURSEMENT</div>
                <div style="font-size: 2rem; font-weight: 700; color: var(--status-present);">₹${calc.payout}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  window.renderApp(`
    ${sidebarHTML}
    <div class="main-wrapper" data-layout="main">
      ${headerHTML}
      <div class="view-container">
        ${payrollContent}
      </div>
    </div>
  `);
}

export function calculateMonthlyPayroll(emp, targetYear = new Date().getFullYear(), targetMonth = new Date().getMonth()) {
  const today = getTodayString();
  const monthDays = new Date(targetYear, targetMonth + 1, 0).getDate();
  const monthStr = String(targetMonth + 1).padStart(2, "0");
  const yearMonthPrefix = `${targetYear}-${monthStr}-`;
  
  let absentDays = 0;
  let unpaidLeaveDays = 0;
  let totalWorkingDays = 0;

  // Calculate working days (excluding weekends and holidays)
  for (let d = 1; d <= monthDays; d++) {
    const dStr = `${yearMonthPrefix}${String(d).padStart(2, "0")}`;
    const dateObj = new Date(dStr);
    const dayOfWeek = dateObj.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !isHoliday(dStr)) {
      totalWorkingDays++;
    }
  }
  
  // Calculate absences and unpaid leaves on working days
  for (let d = 1; d <= monthDays; d++) {
    const dStr = `${yearMonthPrefix}${String(d).padStart(2, "0")}`;
    if (dStr > today) continue;

    const dateObj = new Date(dStr);
    const dayOfWeek = dateObj.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6 || isHoliday(dStr)) continue;

    const leave = getStore().state.timeOff.find(l => 
      l.employeeId === emp.id && 
      l.status === "Approved" && 
      dStr >= l.startDate && 
      dStr <= l.endDate
    );

    if (leave) {
      const leaveWeight = (leave.duration && leave.duration !== "Full") ? 0.5 : 1.0;
      if (leave.leaveType === "Unpaid Leave") {
        unpaidLeaveDays += leaveWeight;
      }
      if (leaveWeight < 1.0) {
        const att = getStore().state.attendance.find(a => a.employeeId === emp.id && a.date === dStr);
        if (!att) {
          absentDays += 0.5;
        }
      }
    } else {
      const att = getStore().state.attendance.find(a => a.employeeId === emp.id && a.date === dStr);
      if (!att) {
        absentDays++;
      }
    }
  }

  const totalAbsences = absentDays + unpaidLeaveDays;
  const payableDays = Math.max(0, totalWorkingDays - totalAbsences);

  const perDayWage = totalWorkingDays > 0 ? (emp.wage / totalWorkingDays) : 0;
  const unpaidDeduction = perDayWage * totalAbsences;
  const proratedWage = Math.max(0, emp.wage - unpaidDeduction);
  
  const bd = getSalaryBreakdown(proratedWage, emp);
  const payout = bd.netSalary;

  return {
    payableDays,
    payout: Math.round(payout),
    unpaidDeduction: Math.round(unpaidDeduction),
    monthDays: totalWorkingDays,
    breakdown: {
      basic: Math.round(bd.basic),
      hra: Math.round(bd.hra),
      standard: Math.round(bd.standard),
      bonus: Math.round(bd.bonus),
      lta: Math.round(bd.lta),
      fixed: Math.round(bd.fixed),
      employerPf: Math.round(bd.employerPf),
      employeePf: Math.round(bd.employeePf),
      pt: Math.round(bd.pt),
      totalDeductions: Math.round(bd.totalDeductions),
      netSalary: Math.round(bd.netSalary)
    }
  };
}

export function showPayslipModal(empId) {
  const emp = getStore().getEmployee(empId);
  const calc = calculateMonthlyPayroll(emp);

  const bodyHTML = `
    <div style="border-bottom: 1px solid var(--border-light); padding-bottom: 16px; margin-bottom: 20px;">
      <h4 style="font-weight: 700; color: var(--accent);">${emp.name}</h4>
      <span style="font-size: 0.8rem; color: var(--text-muted);">${emp.role} (${emp.id})</span>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; font-size: 0.85rem; margin-bottom: 20px;">
      <div><strong>Monthly Base:</strong> ₹${emp.wage}</div>
      <div style="text-align: right;"><strong>Payable / Working Days:</strong> ${calc.payableDays} / ${calc.monthDays}</div>
    </div>

    <div class="salary-group" style="margin-bottom: 20px;">
      <div class="salary-group-title">Earnings Breakdown</div>
      <div class="salary-row"><span>Basic Salary</span><span>₹${calc.breakdown.basic}</span></div>
      <div class="salary-row"><span>HRA</span><span>₹${calc.breakdown.hra}</span></div>
      <div class="salary-row"><span>Bonus / Standard / Fixed</span><span>₹${calc.breakdown.bonus + calc.breakdown.standard + calc.breakdown.fixed}</span></div>
    </div>

    <div class="salary-group" style="margin-bottom: 20px;">
      <div class="salary-group-title">Deductions</div>
      <div class="salary-row"><span>Provident Fund</span><span class="salary-val deduct">₹${calc.breakdown.employeePf}</span></div>
      <div class="salary-row"><span>PT</span><span class="salary-val deduct">₹${calc.breakdown.pt}</span></div>
      <div class="salary-row"><span>Absence Deductions</span><span class="salary-val deduct">₹${calc.unpaidDeduction}</span></div>
    </div>

    <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-light); padding-top: 16px;">
      <div><strong style="color: var(--text-muted);">Net Payout:</strong></div>
      <div style="font-size: 1.5rem; font-weight: 700; color: var(--status-present);">₹${calc.payout}</div>
    </div>
  `;

  showModal("Compensation Pay Slip", bodyHTML);
}
