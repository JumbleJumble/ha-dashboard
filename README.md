# HA Custom Dashboard

Hybrid-architecture Home Assistant dashboard: a TypeScript PWA that talks directly to HA for live state and control, plus a small Node/Fastify backend for config and (later) diagnostics.

See [`plan.md`](./plan.md) for architecture, rationale, and phased build plan.

## Repo layout

```
backend/      Node 20 + TypeScript + Fastify — serves config and (Phase 5) diagnostics
frontend/     Vite + React + TypeScript PWA
config/       rooms.json and dashboards.json (edit freely — no rebuild needed)
```

## Quick start (local dev on macOS)

1. **Create a Home Assistant long-lived access token**
   - HA → profile avatar (bottom-left) → Long-lived access tokens → Create token
   - Copy it somewhere safe, you won't see it again

2. **Configure HA to allow CORS from the dev server**
   Add to HA's `configuration.yaml` and restart HA:
   ```yaml
   http:
     cors_allowed_origins:
       - http://localhost:5173
       - http://192.168.4.22:5173  # replace with your Mac's LAN IP for phone testing
   ```

3. **Fill in `.env` at the repo root**
   ```bash
   cp .env.example .env
   # then edit .env with your HA_URL and HA_TOKEN
   ```

4. **Install + run**
   In two terminals:
   ```bash
   # terminal 1 — backend on :5050
   cd backend
   npm install
   npm run dev

   # terminal 2 — frontend on :5173
   cd frontend
   npm install
   npm run dev
   ```

5. **Open it**
   - Mac: <http://localhost:5173>
   - Phone (same Wi-Fi): <http://YOUR_MAC_IP:5173>

### What you'll see

- **Home page** — one button per room defined in `config/rooms.json`
- **Room page** — a read-only list of entities with live state (Phase 1 scope)
- **Connection badge** top-centre — shows "Connecting to HA…" briefly, then disappears when connected; if auth fails or HA isn't reachable you'll see the error here

When the backend starts it prints every entity HA exposes, grouped by domain. Pick the entity IDs that belong to each room and edit `config/rooms.json` — the changes are picked up on the next request (no restart needed).

## Phase status

- [x] **Phase 1** — read-only dashboard (current)
- [ ] **Phase 2** — tap to toggle, slider to dim
- [ ] **Phase 3** — live updates via HA WebSocket (wired in Phase 1 already; Phase 3 will just add reconnection polish)
- [ ] **Phase 4** — PWA polish, installable on home screen
- [ ] **Phase 5** — diagnostics (backend-served history aggregation)

## Ports

| Port | What |
|---|---|
| 5173 | Vite dev server (frontend) — also exposed on LAN |
| 5050 | Fastify backend (local dev) |
| 5000 | Fastify backend (Docker/Debian) |

## Production deploy

See "Deployment on Debian" in [`plan.md`](./plan.md) — backend runs in Docker, frontend `dist/` is served by the host's existing Caddy instance, Caddy reverse-proxies `/api/*` to the backend container on `127.0.0.1:5000`.
