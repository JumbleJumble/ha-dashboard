# Home Assistant Custom Dashboard — Project Plan

## Overview

A React/TypeScript PWA that talks directly to Home Assistant for live state and control, plus a small Node/TypeScript backend that serves config and handles heavy diagnostics work. One language front-to-back, minimal moving parts, and the thing you do 100× a day (toggle a light) doesn't go through a proxy.

---

## 1. Architecture

```
                    Browser (phone/laptop)
                       │         │
          ┌────────────┘         └────────────┐
          │ HTTP                   WebSocket  │
          │ (config + diagnostics) + REST     │
          ▼                         (live     │
┌─────────────────────────────┐      state +  │
│  Debian Server              │      control) │
│  ┌───────────────────────┐  │               │
│  │  Caddy (already       │  │               │
│  │  running on host)     │  │               │
│  │  - terminates TLS     │  │               │
│  │  - serves Vite build  │  │               │
│  │  - proxies /api/* to  │  │               │
│  │    Node backend       │  │               │
│  └──────────┬────────────┘  │               │
│             │               │               │
│  ┌──────────▼────────────┐  │               │
│  │  Node/TS backend      │  │               │
│  │  (Fastify)            │  │               │
│  │  - config endpoints   │  │               │
│  │  - diagnostics        │  │               │
│  │  - holds own HA WS    │  │               │
│  │    for history/cache  │  │               │
│  └──────────┬────────────┘  │               │
│             │               │               │
└─────────────┼───────────────┘               │
              │                               │
              │  HTTP/WebSocket               │
              ▼                               ▼
        Home Assistant :8123 ◀────────────────┘
```

**Why this split?**
- Control is fast: no proxy hop for toggle/brightness/scene calls
- Phase 3 collapses: no SignalR, no server-side fan-out — the browser subscribes to HA's WebSocket directly
- Diagnostics get a proper home: history queries are expensive and benefit from caching, so they live on the backend
- Config is editable without rebuilding the frontend
- One language everywhere (TypeScript)

**What this split is *not*:** a security boundary. The browser still holds an HA access token to talk to HA directly, so a compromised browser = compromised HA regardless of the backend. If you later need stronger isolation (family members on untrusted devices, exposure beyond your LAN/VPN), the architecture would need to flip to a full proxy model.

### Trust model

- Dashboard is accessed only from trusted devices on your LAN or over Tailscale/VPN
- HA long-lived access token is served to the browser by the backend at `/api/config/ha` after the page loads
- Token is stored in the browser's memory (not `localStorage`) for the session
- Rotate the token periodically; revoke immediately if a device is lost

### Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Backend | Node 20 + TypeScript + Fastify | Small, fast, one-language stack; great TS support |
| HA client (backend) | `home-assistant-js-websocket` | Official HA JS client, used by HA's own frontend |
| HA client (browser) | Same package, or a small hand-rolled client | ~100 LOC for auth + subscribe + call_service is fine |
| Frontend | React 18 + TypeScript | Component model suits device cards; TS catches API shape mismatches early |
| Build tool | Vite | Fast dev server with HMR, small production bundles |
| UI components | shadcn/ui + Tailwind CSS | Mobile-first, headless components; no heavy component library lock-in |
| State management | Zustand | Lightweight global store for entity state; updates surgical via selectors |
| PWA | Vite PWA plugin | Adds manifest + service worker; installable on iOS and Android |
| Container | Docker + docker-compose | Backend runs in Docker; frontend is a static build on disk |
| Reverse proxy | Caddy (already on the host) | Terminates TLS automatically, serves static frontend from disk, proxies `/api/*` to the Node backend |

### `home-assistant-js-websocket`

```
npm install home-assistant-js-websocket
```

- GitHub: https://github.com/home-assistant/home-assistant-js-websocket
- Official package, maintained by the HA team
- Works in both Node and browser
- Handles auth handshake, reconnection, message IDs, and subscription bookkeeping
- Typed entities, events, and service calls

---

## 2. Home Assistant API Primer

### Authentication

All API calls require a **Long-Lived Access Token**.

**How to get one:**
1. Open HA web UI → click your profile avatar (bottom-left)
2. Scroll to "Long-lived access tokens" → Create Token
3. Copy it — you only see it once

**Use it like this (REST):**
```
Authorization: Bearer <your_token>
Content-Type: application/json
```

Store the token as an environment variable on the backend. The browser fetches it from the backend on load; it never ships in the frontend bundle.

### CORS (important for browser-direct calls)

Since the browser hits HA directly, HA must allow your dashboard's origin. Add to `configuration.yaml`:

```yaml
http:
  cors_allowed_origins:
    - https://dashboard.example.com
```

(Replace with whatever hostname you've put in your Caddyfile.)

Restart HA after changing this.

---

### REST API

Base URL: `http://<ha-host>:8123/api`

| Endpoint | Method | What it does |
|---|---|---|
| `/api/` | GET | Health check — returns `{"message": "API running."}` |
| `/api/states` | GET | All entities and their current state + attributes |
| `/api/states/{entity_id}` | GET | Single entity (e.g. `light.living_room`) |
| `/api/states/{entity_id}` | POST | Set entity state (mostly for virtual/helper entities) |
| `/api/services/{domain}/{service}` | POST | **Call a service** — this is how you control devices |
| `/api/config` | GET | HA configuration info (location, unit system, version) |
| `/api/events` | GET | List of available event types |
| `/api/history/period/{timestamp}` | GET | Historical states (used by the backend for diagnostics) |
| `/api/logbook/{timestamp}` | GET | Human-readable event log |

The browser will mostly use `/api/services/*` (for control). The backend will mostly use `/api/history/period/*` (for diagnostics).

**Key service calls the browser will make:**

```json
// Turn on a light
POST /api/services/light/turn_on
{ "entity_id": "light.living_room", "brightness": 200 }

// Turn off a light
POST /api/services/light/turn_off
{ "entity_id": "light.living_room" }

// Toggle a switch/plug
POST /api/services/switch/toggle
{ "entity_id": "switch.kitchen_plug" }

// Set brightness + colour temp
POST /api/services/light/turn_on
{ "entity_id": "light.bedroom", "brightness": 128, "color_temp_kelvin": 3000 }
```

**Entity state response shape:**
```json
{
  "entity_id": "light.living_room",
  "state": "on",
  "attributes": {
    "brightness": 200,
    "color_mode": "color_temp",
    "color_temp_kelvin": 3000,
    "friendly_name": "Living Room Ceiling",
    "supported_color_modes": ["color_temp", "brightness"]
  },
  "last_changed": "2026-04-20T10:30:00.000Z",
  "last_updated": "2026-04-20T10:30:05.000Z",
  "context": { "id": "...", "parent_id": null, "user_id": null }
}
```

---

### WebSocket API (used from the browser)

Connection URL: `ws://<ha-host>:8123/api/websocket`

**Auth handshake (happens once on connect):**
```
← { "type": "auth_required", "ha_version": "2024.x.x" }
→ { "type": "auth", "access_token": "<token>" }
← { "type": "auth_ok", "ha_version": "2024.x.x" }
```

Every subsequent message needs a unique integer `id` so you can match responses. `home-assistant-js-websocket` manages this for you.

**Subscribe to all state changes:**
```json
→ { "id": 1, "type": "subscribe_events", "event_type": "state_changed" }
← { "id": 1, "type": "result", "success": true, "result": null }

// Then for every state change in HA:
← {
    "id": 1,
    "type": "event",
    "event": {
      "event_type": "state_changed",
      "data": {
        "entity_id": "light.living_room",
        "old_state": { "state": "off", "attributes": {} },
        "new_state": { "state": "on", "attributes": { "brightness": 200 } }
      }
    }
  }
```

**Fetch all current states (hydrate on load):**
```json
→ { "id": 2, "type": "get_states" }
← { "id": 2, "type": "result", "success": true, "result": [ ...all entities... ] }
```

**Call a service via WebSocket (alternative to REST):**
```json
→ {
    "id": 3,
    "type": "call_service",
    "domain": "light",
    "service": "turn_on",
    "service_data": { "entity_id": "light.bedroom", "brightness": 255 }
  }
← { "id": 3, "type": "result", "success": true }
```

Using `call_service` over the existing WebSocket avoids a separate HTTP round-trip and is the recommended path when the connection is already open.

---

### Entity domains you'll care about

| Domain | What it is | State values | Key attributes |
|---|---|---|---|
| `light` | Hue bulbs, Zigbee lights | `on` / `off` / `unavailable` | `brightness`, `color_temp_kelvin`, `hs_color`, `rgb_color` |
| `switch` | Smart plugs, generic switches | `on` / `off` / `unavailable` | Sometimes `power`, `current`, `voltage` (for smart plugs) |
| `binary_sensor` | Motion, door/window | `on` / `off` | `device_class` (motion, door, etc.) |
| `sensor` | Temperature, energy | numeric string | `unit_of_measurement`, `device_class` |
| `scene` | Saved light scenes | `scening` | — |
| `automation` | HA automations | `on` / `off` | `last_triggered` |

**`unavailable` state** is important for your diagnostics goal — this is what HA shows when it can't reach a Zigbee device.

---

## 3. Dashboard Design Considerations

### Navigation model — sparse by default

The home screen shows **only room buttons** — nothing else. Tapping a room navigates to that room's page, which is where all the controls live. This keeps the home screen uncluttered and makes the app feel intentional rather than like a data dump.

```
/ (home)
├── Lounge         →  /room/lounge
├── Bedroom        →  /room/bedroom
├── Kitchen        →  /room/kitchen
└── Diagnostics    →  /diagnostics

/dashboards/:dashId  →  custom cross-room dashboards
```

**Two types of shareable pages:**

1. **Room pages** (`/room/:roomId`) — all entities in a single room, auto-populated from the room config
2. **Custom dashboards** (`/dashboards/:dashId`) — a curated list of controls that can span rooms; defined entirely in config, no in-app UI needed

Both have their own URL and are independently installable as PWA shortcuts on someone's phone home screen. A person who only controls the bedroom and the hallway light gets a single dashboard pinned — they never see anything else.

**Custom dashboards are config-driven.** You define them in a JSON config file served by the backend (with AI help as needed) — no admin UI required. Each dashboard is a list of sections, and each section is a list of entity IDs with optional labels. The frontend renders whichever controls match each entity's domain/capabilities.

Example config shape:
```json
{
  "id": "evening",
  "label": "Evening",
  "sections": [
    {
      "label": "Downstairs",
      "entities": ["light.lounge_ceiling", "light.lounge_lamp", "switch.tv_plug"]
    },
    {
      "label": "Upstairs",
      "entities": ["light.bedroom_ceiling"]
    }
  ]
}
```

Adding a new dashboard = edit the config file on the server and restart the backend (or hot-reload). The frontend doesn't need to change.

React Router handles both routes: `<Route path="/room/:roomId">` and `<Route path="/dashboards/:dashId">`. The room page is just a special case of a dashboard — it reads its entities from the room config rather than a dashboard config. The same `DashboardPage` component can render both if you normalise them to the same shape before passing to React.

### Room page layout — start minimal

A room page initially shows:

1. **All lights on / all lights off** — a single prominent toggle at the top that calls `light/turn_on` or `light/turn_off` with all entity IDs in the room
2. **Master brightness slider** — calls `light/turn_on` with `brightness` on all lights simultaneously
3. **Per-light row** — name, on/off toggle, individual brightness slider (only shown for dimmable bulbs)
4. **Per-plug row** — name, on/off toggle only

Resist adding more until it's needed. Colour controls, scenes, schedules — all Phase 5+.

### Lights vs plugs vs switches — treat them differently in UI

| Device type | UI treatment |
|---|---|
| Dimmable light | Toggle + brightness slider |
| Colour light | Same as dimmable for now; colour picker is Phase 5 |
| On/off only light | Toggle only, no slider |
| Smart plug | Toggle only, larger tap target |
| Generic switch | Toggle only |

Check `supported_color_modes` on a light entity to decide whether to show a slider — if modes is `["onoff"]` only, skip it.

### Mobile-first layout

- Home screen: large, tappable room buttons — full width, tall enough to hit easily in the dark
- Room page: single-column list of controls, full-width rows
- Touch targets minimum 48×48px — use shadcn/ui `Button` and `Slider`
- Dark mode by default — Tailwind's `dark:` classes
- PWA via `vite-plugin-pwa` — installable on iOS and Android; set `display: standalone` so there's no browser chrome
- Avoid hover-only interactions — everything works with tap

### Handling `unavailable` and `unknown`

Always render these states visually — a greyed-out row with a warning icon. Never silently hide a device.

---

## 4. Phased Build Plan

### Phase 1 — Read-only dashboard (foundation)

**Goal:** Home screen with room buttons; tap into a room and see which lights are on/off.

Steps:
1. Scaffold the backend: Node + TypeScript + Fastify, `home-assistant-js-websocket`, Docker support
2. Backend endpoints:
   - `GET /api/config/ha` — returns `{ url, token }` for the browser to connect to HA
   - `GET /api/rooms` — list of rooms from `rooms.json`
   - `GET /api/rooms/{roomId}` — single room definition
   - `GET /api/dashboards` — list of dashboards from `dashboards.json`
   - `GET /api/dashboards/{dashId}` — single dashboard definition
3. Scaffold Vite + React + TypeScript (`npm create vite@latest`), add React Router, Tailwind CSS, shadcn/ui
4. On app load: fetch `/api/config/ha`, open a WebSocket to HA, do the auth handshake, send `get_states` to hydrate a Zustand entity store
5. Build three screens: `HomePage` (room buttons), `DashboardPage` (shared renderer), routed at `/`, `/room/:roomId`, and `/dashboards/:dashId`
6. `DashboardPage` renders a read-only row per entity showing name and current state (on/off/unavailable)
7. Backend runs in Docker with `HA_URL` and `HA_TOKEN` env vars; the frontend is built to a directory Caddy serves, and Caddy proxies `/api/*` to the backend container

Deliverable: Navigate to `/room/lounge`, see all entities and their current state. Each room URL is bookmarkable.

---

### Phase 2 — Control (toggle/dim from the dashboard)

**Goal:** Tap a card to turn a light on/off; use a slider for brightness.

Steps:
1. Wire up click/slider handlers to call HA directly via `call_service` over the existing WebSocket connection (or REST if preferred)
2. Handle optimistic UI — update card immediately, revert if the HA call fails
3. Differentiate light cards (with brightness slider) from switch cards (toggle only)
4. Debounce slider changes so you don't spam HA with a service call on every pixel of drag

Deliverable: Full control of lights and plugs from the dashboard. No backend involvement for control.

---

### Phase 3 — Real-time updates

**Goal:** State changes in HA appear on the dashboard without page refresh.

This phase is much smaller than it would be with a proxied architecture — the browser is already connected to HA from Phase 1.

Steps:
1. After auth, send `subscribe_events` for `event_type: "state_changed"` on the existing WebSocket
2. Route each incoming event into the Zustand store, replacing the entry for `event.data.entity_id`
3. Each `LightRow` / `SwitchRow` subscribes to its own slice via a Zustand selector — updates are surgical, no full re-renders
4. Handle reconnection: on WebSocket close, wait with exponential backoff, reconnect, re-auth, re-subscribe, and re-hydrate via `get_states` (covers any events missed during the outage)

Deliverable: Turn a light on with a physical switch — dashboard updates within ~1 second.

---

### Phase 4 — Polish and installable PWA

**Goal:** Something you'd actually pin to your phone home screen and use daily.

Steps:
1. Room page: add "All on / All off" master toggle and master brightness slider at the top
2. Refine row designs — brightness percentage label next to slider, unavailable state styling
3. Add subtle animations for state transitions (light fading in/out)
4. Full mobile layout pass — test on iPhone and Android, fix any tap target issues
5. Add `vite-plugin-pwa` — manifest, service worker, offline shell
6. Set each room's URL as an installable shortcut so `/room/lounge` can be added to home screen independently
7. Dark mode polish — ensure all states look good in a dark room

Deliverable: Add `/room/lounge` to your phone home screen; opens instantly with no browser chrome, looks like a native app.

---

### Phase 5 — Stretch goals

**Scenes:**
- List scenes from the Zustand store filtered to `scene.*` domain
- Activate with `call_service` for `scene.turn_on`
- Add a "Scenes" section to each room page

**Automations UI:**
- List automations from the store filtered to `automation.*`
- Show enabled/disabled state and last triggered time
- Toggle enable/disable via `automation.turn_on` / `automation.turn_off`

**Diagnostics for flaky devices (see Section 5):**
- Backend endpoints for historical analysis (unavailability, LQI trends)
- Dedicated `/diagnostics` page driven by backend data + live state from the store

**Energy monitoring:**
- Smart plugs with energy sensors — small sparkline graphs served by the backend via the history API
- Backend endpoint: `GET /api/history/energy/{entity_id}?hours=24`

---

## 5. Diagnostics for Flaky Devices

This is where the backend earns its keep. The split is clean: anything derivable from *current state* lives in the browser; anything that needs *history* lives on the backend.

### What HA exposes

Every entity has:
- `state` — will be `unavailable` when HA can't reach the device
- `last_changed` — timestamp of last state change (went on, went off, went unavailable)
- `last_updated` — timestamp of last attribute update, even if state didn't change

For Zigbee devices specifically, HA often creates companion entities:
- `sensor.{device}_lqi` — Link Quality Indicator (0–255, higher is better)
- `sensor.{device}_rssi` — signal strength in dBm
- `binary_sensor.{device}_battery_low` — battery warning

### Browser-side (from live state)

These come for free from the Zustand store and need no backend involvement:

- **"Last seen X minutes ago"** — derived from `last_updated`
- **Red border / warning icon** when `state === "unavailable"`
- **Current LQI/RSSI** shown in a tooltip or expansion — just read `sensor.{device}_lqi` from the store
- **Battery low warning** — read the companion `binary_sensor`

### Backend-side (history and aggregation)

The backend maintains its own HA WebSocket connection, caches history queries, and exposes:

- `GET /api/diagnostics/unavailable` — list of all entities currently `unavailable` (aggregated from current state, but cached so the diagnostics page loads instantly)
- `GET /api/diagnostics/unavailability-history?hours=24` — entities that have been `unavailable` in the last 24h and for how long, built from `/api/history/period`
- `GET /api/diagnostics/signal-quality` — LQI/RSSI for all Zigbee devices, sorted ascending (weakest first), with a rolling 24h average
- `GET /api/diagnostics/stale?hours=1` — devices that haven't reported an update in >1h (catches devices that aren't saying they're unavailable but also aren't reporting)

The backend should cache these responses for 30–60 seconds; the diagnostics page isn't a real-time view.

### Diagnostics page (`/diagnostics`)

Combines the two sources:
- **Currently unavailable** — from the backend, refreshed every minute
- **Recently unavailable (24h)** — from the backend
- **Weak signal** — from the backend (sorted ascending)
- **Not seen >1h** — from the backend
- **Per-entity detail** — on click, expand to show current LQI/RSSI live from the Zustand store (browser-side)

### Why this helps your specific problem

The devices that "randomly stop working" are likely either dropping off the Zigbee mesh (LQI/RSSI will be low before they fail) or experiencing interference. Seeing LQI trends over 24h will tell you whether it's a range/placement problem vs a firmware/pairing issue.

---

## 6. Deployment on Debian

### Project structure

```
home-automation/
├── docker-compose.yml                ← just the backend container
├── .env                              ← HA_TOKEN (never commit)
├── Caddyfile.snippet                 ← reference config to merge into host Caddyfile
├── config/
│   ├── rooms.json                    ← room definitions (name, entity IDs)
│   └── dashboards.json               ← custom dashboard definitions
├── frontend/                         ← React + TypeScript (Vite)
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── store/                    ← Zustand stores (entities, config)
│       ├── ha/
│       │   ├── connection.ts         ← WebSocket lifecycle + auth
│       │   └── services.ts           ← call_service helpers
│       ├── components/
│       │   ├── DashboardPage.tsx     ← shared by /room/:id and /dashboards/:id
│       │   ├── LightRow.tsx
│       │   ├── SwitchRow.tsx
│       │   └── SectionGroup.tsx
│       └── types/
│           └── ha.ts
└── backend/
    ├── package.json
    ├── tsconfig.json
    ├── Dockerfile
    └── src/
        ├── index.ts                  ← Fastify bootstrap
        ├── routes/
        │   ├── config.ts             ← /api/config/ha, /api/rooms, /api/dashboards
        │   └── diagnostics.ts        ← /api/diagnostics/*
        ├── ha/
        │   └── client.ts             ← long-lived HA WS connection + history cache
        └── types/
            └── ha.ts
```

The frontend `dist/` build output is deployed to a directory Caddy serves (e.g. `/var/www/ha-dashboard/`). It isn't containerised — there's no point wrapping static files in a container when Caddy on the host can serve them directly.

### docker-compose.yml (skeleton)

Just the backend — Caddy is already running on the host and will reach it via `127.0.0.1:5000`.

```yaml
services:
  backend:
    build: ./backend
    environment:
      - HA_URL=http://homeassistant.local:8123
      - HA_TOKEN=${HA_TOKEN}
      - CONFIG_DIR=/config
    volumes:
      - ./config:/config:ro
    ports:
      - "127.0.0.1:5000:5000"   # bind to loopback only; Caddy is the only client
    restart: unless-stopped
```

### Dockerfile (backend — Node + TypeScript)

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 5000
CMD ["node", "dist/index.js"]
```

### Frontend build and deploy

The frontend is a plain Vite build — no Dockerfile needed. Build it and copy the output to where Caddy serves it:

```bash
cd frontend
npm ci
npm run build
sudo rsync -a --delete dist/ /var/www/ha-dashboard/
```

You can wrap this in a `deploy.sh` script or a Makefile target. A GitHub Actions workflow or a git hook on the Debian server can automate it if you want.

### Caddyfile snippet

Add this site block to your existing Caddyfile (or as an included file):

```caddy
dashboard.example.com {
    root * /var/www/ha-dashboard
    encode zstd gzip

    # SPA fallback: serve index.html for any path that isn't a file
    try_files {path} /index.html
    file_server

    # Backend API
    handle_path /api/* {
        reverse_proxy 127.0.0.1:5000
    }
}
```

Caddy handles TLS automatically via Let's Encrypt — no certbot needed.

Notes:
- No WebSocket upgrade headers required: the browser's WebSocket connection to HA goes directly to HA's own port (`:8123`), not through Caddy. Caddy only proxies plain HTTP to the backend.
- `handle_path` strips `/api` before proxying, so Fastify sees routes like `/config/ha` rather than `/api/config/ha`. Adjust to taste — if you'd rather keep the prefix in the backend routes, use `handle /api/* { reverse_proxy 127.0.0.1:5000 }` instead.

### Running it

```bash
# On the Debian server
git clone <your-repo>
cd home-automation
echo "HA_TOKEN=your_token_here" > .env
docker-compose up -d

# Watch logs
docker-compose logs -f backend
```

### Optional: native deployment without Docker

Run the backend with `node dist/index.js` behind a systemd unit; the frontend build step is the same as above (it already goes to a directory Caddy serves, with no container involved).

```ini
# /etc/systemd/system/ha-dashboard-backend.service
[Unit]
Description=HA Dashboard Backend
After=network.target

[Service]
WorkingDirectory=/opt/ha-dashboard/backend
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
Environment=HA_URL=http://homeassistant.local:8123
Environment=HA_TOKEN=your_token_here
Environment=CONFIG_DIR=/opt/ha-dashboard/config
User=ha-dashboard

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable ha-dashboard-backend
sudo systemctl start ha-dashboard-backend
```

---

## Quick Reference Card

| Thing you want to do | How |
|---|---|
| Get all entities (initial hydrate) | Browser: `get_states` over WS |
| Watch for changes | Browser: `subscribe_events` with `event_type: state_changed` |
| Turn on a light | Browser: `call_service` for `light.turn_on` |
| Toggle a plug | Browser: `call_service` for `switch.toggle` |
| Load room/dashboard config | Browser: `GET /api/rooms` / `GET /api/dashboards` |
| Get HA connection info | Browser: `GET /api/config/ha` (on load) |
| Find flaky devices (live) | Browser: filter store for `state === "unavailable"` |
| Find flaky devices (historical) | Backend: `GET /api/diagnostics/unavailability-history` |
| Device signal quality (live) | Browser: read `sensor.{device}_lqi` from store |
| Device signal quality (trend) | Backend: `GET /api/diagnostics/signal-quality` |
| Check if HA is up | Browser: connection state of the WS |

---

*Last updated: 2026-04-20*
