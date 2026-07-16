# WorkForces HRMS

Offline-first HRMS **portfolio demo** for a **50–200 employee Indian SMB** HR team that still runs attendance, leave, and payroll from spreadsheets.

**Target user:** HR Admin at a small/medium company in India (single HR seat, occasional employee self-service).

## Product prioritization (MVP → demo extras)

| Priority | Module | Why |
|----------|--------|-----|
| P0 | Employee records + auth/RBAC | Core HR identity; everything else hangs off this |
| P0 | Attendance + leave | Daily HR workload for the target persona |
| P1 | Payroll helpers (Indian PT/PF/TDS) | Differentiator for Indian SMB; demo calculations only |
| P2 | Offline sync + conflict merge | Portfolio proof of distributed-thinking |
| P3 | Documents, audit trail, Grafana | Demo depth — cut first if trimming scope |

See [docs/P0-DEMO-SCOPE.md](docs/P0-DEMO-SCOPE.md) for a trimmed interview walkthrough.

**Demo impact (portfolio context):**
- Replaces a 4-sheet Excel workflow with one offline-capable app
- **91 Vitest tests** + **Playwright e2e** (API + browser UI offline sync)
- Manual multi-tab walkthrough documented below

This is **not production HR software**. Passwords and records are demo-grade — do not market as a “secure HRMS”.

## Architecture

```text
Browser (IndexedDB client cache + sync queue)
  src/store.js, src/sync.js, src/views/*
        │  fetch /api/*
        ▼
Node server (server.js)
  backend/store.js    SQLite file persistence (data/workforces.db) — atomic transactions, WAL mode
  backend/engine.js   Vector clock conflict resolution, Auth, HMAC signing
  backend/routes.js   API endpoints for /api/sync and static file servingts
  GET /metrics, POST /api/telemetry
```

The browser keeps a local IndexedDB cache for offline UX; **authoritative auth, RBAC, and sync merge run on the Node backend**. After a successful sync, the client **reconciles** its employee cache from `GET /api/employees` (`reconcileClientCache` in `src/sync.js`).

Sync is **HTTP-only** in this demo — no WebSocket transport.

## Running

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # Vitest unit + integration
npm run test:e2e     # Playwright — see ports below
```

### Ports

| Command | Port | Notes |
|---------|------|-------|
| `npm run dev` / `npm start` | **3000** | Default local development |
| `npm run test:e2e` | **3010** | Playwright starts its own server via `playwright.config.js` with `WORKFORCES_MEMORY_DB=1` |

Playwright e2e does **not** reuse your dev server on 3000 — it spins up an isolated instance on 3010.

## Multi-tab sync demo

### Local Multi-Tab Offline Demo
1. Open http://localhost:3010/ in **Tab A** and **Tab B**.
2. Go Offline in Tab A (Chrome DevTools -> Network -> Offline).
3. In Tab A, edit an employee's phone number.
4. In Tab B, edit the *same* employee's department.
5. Go Online in Tab A. Watch the `cloud-sync-status` badge indicate sync status. 
6. Both tabs will reconcile via Vector Clocks. No data is lost. Console telemetry shows `conflictCount` when merges occur.

Cross-device sync would need a hosted backend; this demo validates merge logic against the real `/api/sync` endpoint.

## Deployment

```bash
npm start
docker compose up --build
```

Endpoints:
- `GET /health`, `GET /metrics`, `POST /api/telemetry`
- `POST /api/auth/login`, `POST /api/auth/register`, `GET /api/employees`, `POST /api/sync`

Optional observability: Prometheus + Grafana only (`docker compose up`).

## Security Notes

- PBKDF2 + HMAC sessions on the server; client-side IndexedDB is a cache only.
- Renderer sanitization; navigation uses `data-nav-route` / `data-wf-click` delegation (CSP without `'unsafe-inline'` scripts).
- AES-GCM decrypt rejects corrupted ciphertext (auth tag validation).
- **Demo data only** — anyone with server/browser access can read records.

## Tests

```bash
npm test                 # Vitest — run `npm test` for current count
npm run test:e2e         # Playwright: api-conflict + browser-sync specs
npm run test:coverage
```

Key suites:
- `tests/client-server-reconcile.test.js` — client cache matches server after sync
- `tests/conflict-sync.integration.test.js`, `tests/merge.test.js`
- `e2e/api-conflict.spec.js`, `e2e/browser-sync.spec.js`

## Type checking

JSDoc contracts in `src/api-types.js` and `backend/types.js` with `checkJs: true` in `jsconfig.json` (no TypeScript migration).
