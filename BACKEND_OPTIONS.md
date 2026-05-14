# Backend Options for Friend Graph

## Current state
Data is stored in `localStorage` only — it lives in the browser and is lost if you clear site data or switch devices.
The codebase is already structured to swap the storage layer in one place: `src/lib/friend-graph-storage.ts`.

---

## Option 1 — Firebase Firestore ⚡ easiest, zero infra

**Already 90% wired in this project.**

### Setup
1. Go to [Firebase Console](https://console.firebase.google.com/) → create a project → add a Web app.
2. Enable **Authentication → Anonymous**.
3. Enable **Firestore** (start in production mode).
4. Deploy `firestore.rules` (in this repo) via the console or CLI.
5. Copy the config into `.env.local` (use `.env.local.example` as a template).

### Pros
- No infra to manage
- Free Spark tier: 1 GB storage, 50k reads/day, 20k writes/day — plenty for a friend graph
- Realtime sync already implemented (`onSnapshot`)
- Works from any device with internet

### Cons
- Data lives on Google's servers
- Requires internet — no offline-first write (reads are cached)

---

## Option 2 — PocketBase on Raspberry Pi 🥧 recommended self-hosted

**Single binary, runs great on Pi, realtime, built-in admin UI.**

### Setup (on the Pi)
```bash
# download for ARM64
wget https://github.com/pocketbase/pocketbase/releases/latest/download/pocketbase_linux_arm64.zip
unzip pocketbase_linux_arm64.zip

# run
./pocketbase serve --http="0.0.0.0:8090"
```

Then open `http://<pi-ip>:8090/_/` to create an admin account and two collections:

| Collection | Fields |
|------------|--------|
| `nodes` | `kind` (text), `name` (text), `description` (text), `imageUrl` (text), `createdAt` (text) |
| `links` | `source` (text), `target` (text), `createdAt` (text) |

Set collection rules to allow access (or add auth later).

### Access via Tailscale
Because you have Tailscale on the Pi, any device on your Tailscale network can reach it at:
```
http://<pi-tailscale-ip>:8090
```
No port forwarding, no DNS needed.

### Run as a service (systemd)
```ini
# /etc/systemd/system/pocketbase.service
[Unit]
Description=PocketBase
After=network.target

[Service]
ExecStart=/home/pi/pocketbase/pocketbase serve --http="0.0.0.0:8090"
Restart=always
User=pi

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl enable --now pocketbase
```

### Integration in this project
Swap `src/lib/friend-graph-storage.ts` load/save calls for fetch calls to PocketBase's REST API:
```
GET  http://<pi-tailscale-ip>:8090/api/collections/nodes/records
POST http://<pi-tailscale-ip>:8090/api/collections/nodes/records
PATCH/DELETE ...
```
PocketBase also has a JS SDK (`pocketbase` npm package) and realtime subscriptions.

### Pros
- Your data, your hardware
- Accessible from all Tailscale devices (phone, laptop, etc.)
- Single binary — no Docker, no database setup
- Built-in admin UI at `/_/`
- Realtime via SSE subscriptions

### Cons
- Pi needs to be on and reachable (Tailscale handles the networking)
- No access outside your Tailscale network (unless you add a relay/exit node)

---

## Option 3 — Next.js API routes + SQLite (better-sqlite3)

Run the database on the same machine as the Next.js app (or Pi).

### Pros
- No separate service to run
- Everything in one repo
- SQLite is fast enough for this workload

### Cons
- Doesn't work well with Next.js serverless/edge deployments (Vercel etc.)
- Need to manage the file path and backups manually
- No built-in realtime

---

## Option 4 — Turso (hosted SQLite)

[Turso](https://turso.tech/) is a managed SQLite service with a generous free tier (9 GB, 500 databases).

### Pros
- SQLite ergonomics, hosted — no Pi required
- Works from any internet connection
- Edge-friendly (works with Vercel, Cloudflare etc.)

### Cons
- Data is hosted externally (not on your Pi)
- Slightly more complex setup than Firestore

---

## Summary

| | Effort | Your infra | Realtime | Works offline |
|---|---|---|---|---|
| **Firestore** | Minimal (already wired) | No | Yes | Reads only |
| **PocketBase on Pi** | Low (single binary) | Yes (Pi + Tailscale) | Yes | No |
| **SQLite in Next.js** | Medium | Yes | No | Yes |
| **Turso** | Low–medium | No | Partial | No |

**Recommendation:**
- Want it done in 5 minutes with no maintenance? → **Firestore**
- Want full control and data on your own hardware? → **PocketBase on Pi via Tailscale**
