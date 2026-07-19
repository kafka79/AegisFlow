# Deployment

## Quick Deploy (Render)

1. Fork this repo.
2. Go to [render.com](https://render.com) → New Web Service.
3. Connect your fork.
4. Set:
   - **Build Command**: `npm ci`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/health`
5. Add env vars (optional):
   - `PORT` — defaults to `3000`
   - `WORKFORCES_MEMORY_DB=1` — use in-memory DB (resets on restart)
6. Deploy.

## Docker

```bash
docker compose up --build
```

Exposes port 3000 with SQLite persisted in `data/`.

## Seed Data

After first deploy, seed demo records:

```bash
node scripts/seed-demo-data.js
```

Or via Docker:

```bash
docker compose run --rm app node scripts/seed-demo-data.js
```

## Production Checklist

Before going live:
- [ ] Set `WORKFORCES_DB_PATH` to a persistent volume path
- [ ] Rotate the HMAC signing key via `/api/admin/rotate-keys`
- [ ] Set `NODE_ENV=production`
- [ ] Configure a reverse proxy (nginx/Caddy) for TLS termination
- [ ] Set up regular SQLite backups
