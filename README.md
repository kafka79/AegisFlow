# WorkForces HRMS

Offline-first HRMS **portfolio demo** for a **50–200 employee Indian SMB** HR team that still runs attendance, leave, and payroll from spreadsheets.

**Target user:** HR Admin at a small/medium company in India (single HR seat, occasional employee self-service).

**Demo impact (portfolio context):**
- Replaces a 4-sheet Excel workflow (employees, attendance, leave, payroll) with one offline-capable app
- Exercises Indian payroll rules (state-wise Professional Tax, PF/ESI breakdown helpers)
- Validated manually with a 3-person walkthrough (HR admin + 2 employees) and 89 automated tests

This is **not production HR software**. The mock backend in `src/server.js` is a separate IndexedDB namespace in the **same browser origin** — it demonstrates auth, RBAC, HMAC sessions, and sync behavior; it is not an isolated server.

## Architecture

```text
Browser
  index.html
  style.css
  src/helpers.js       Payroll, dates, validation, audit helpers
  src/merge.js         Shared per-field vector-clock merge
  src/store.js         IndexedDB-backed client state
  src/views.js         HRMS screens and form handlers
  src/router.js        History/hash navigation
  src/renderer.js      Sanitized DOM patching and focus helpers
  src/sync.js          Offline queue and mock-server sync
  src/crypto.js        PBKDF2, AES-GCM, HMAC session tokens (demo-grade)
  src/server.js        Browser-local mock backend (IndexedDB)
  workforces-overrides.js  Runtime orchestration and enhanced views

server.js (root)       Static file server, /health, /metrics, /api/telemetry
```

## Running

```bash
npm install
npm run dev
npm test
```

Open `http://localhost:3000`.

The first workspace registration must create an HR account. After that, new user creation requires an authenticated HR session.

## Multi-tab sync demo

Prove offline conflict merge across clients (two browser tabs):

1. Start the app: `npm run dev` and open `http://localhost:3000` in **Tab A**.
2. Register/log in as HR and open **Employees → John Doe**.
3. Open the **same URL** in **Tab B** (same browser profile so IndexedDB is shared for the mock server).
4. In Tab A, go offline (DevTools → Network → Offline). Edit John's **name** to `John Tab A`. Save.
5. In Tab B, go offline. Edit John's **phone** to `+91 90000 00099`. Save.
6. Bring both tabs **online**. Wait ~15s or trigger sync from the status indicator.
7. Open John Doe again — **both fields** should be present. Check DevTools console for `conflictCount` in sync telemetry JSON.

Cross-device sync would require a real backend; this demo validates merge logic and queue behavior inside one browser origin.

## Deployment

```bash
npm start
docker compose up --build
```

The Docker image runs the static server on port `3000` and exposes:
- `GET /health` — liveness
- `GET /metrics` — Prometheus text metrics (`http_requests_total`, `sync_operations_total`, …)
- `POST /api/telemetry` — browser sync telemetry beacons (used by `src/sync.js`)

Optional local observability (Prometheus + Grafana only — no log pipeline theater):

```bash
docker compose up --build
# App: http://localhost:3000  |  Grafana: http://localhost:3001  |  Prometheus: http://localhost:9090
```

Grafana dashboards read Prometheus metrics scraped from the static server's `/metrics` endpoint and client telemetry posted to `/api/telemetry`.

## Security Notes

- Passwords are stretched with PBKDF2 before storage in the browser-local mock backend.
- Session tokens are HMAC-signed with rotation and include expiry plus CSRF token data.
- Renderer output is sanitized before DOM insertion; `href`/`src` allow only http(s) and relative paths.
- **All data lives in browser storage.** Anyone with DevTools access can read it. Use demo data only.

## Tests

```bash
npm test
npm run test:coverage
```

Coverage focuses on crypto, per-field merge (`tests/merge.test.js`), sync queue behavior, store persistence, renderer sanitization, routing, and mock-server auth/RBAC behavior.
