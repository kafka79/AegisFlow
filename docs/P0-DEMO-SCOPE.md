# P0 demo scope (interview trim)

Use this when you need a **15-minute walkthrough** instead of the full feature surface.

## Include (P0)

| Area | What to show |
|------|----------------|
| Auth + RBAC | HR login, employee self-service login |
| Employees | List, profile, onboard one employee |
| Attendance | Check-in / check-out on dashboard |
| Leave | Apply leave, HR approve |
| Offline sync | Multi-tab demo in README — concurrent field merge |

## De-emphasize or skip (P2–P3)

| Area | Why trim |
|------|----------|
| Payroll / payslip modals | Demo calculations only; not payroll product |
| Compliance center / exports | Portfolio depth, not core narrative |
| Document vault | Nice-to-have; cuts time |
| Grafana / Prometheus | Mention observability hook; skip live dashboard unless asked |
| Email mock inbox | Internal demo aid |

## Suggested script (~12 min)

1. **Problem** — 50–200 employee Indian SMB still on spreadsheets (README persona).
2. **Login** — HR admin.
3. **Employees** — John Doe profile; edit one field.
4. **Multi-tab sync** — second tab, offline edit on another field, reconcile online.
5. **Tests** — `npm test` (Vitest) + `npm run test:e2e` (Playwright on port **3010**).
6. **Honest limits** — demo-grade security, SQLite in-memory/file store on server, not production HR.

## Branch idea

For interviews, a `p0-demo` branch could hide sidebar links to Payroll and Compliance via a single feature flag — not required for the portfolio repo, but this doc defines what to **talk about** vs **skip**.
