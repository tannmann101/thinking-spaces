# Thinking Spaces

See `CLAUDE.md` for the full project brief, architecture, and roadmap.

## Status

Pass 2 in progress: all five Block types (Text, List, Reference, Media,
Comparison) and all four List-based Views (Timeline, Progress, Streak,
Ledger) are implemented and demoed in the Test Space, along with a
basic backlink lookup. No Templates yet, no Dev Mode, no cross-Space
Graph view.

## Running it during development

While this is being built, run it on your own machine (a Windows 11
laptop) with two servers, in two terminals:

```bash
# Terminal 1 -- backend (Express + SQLite), http://localhost:3001
cd backend
npm install
npm run dev

# Terminal 2 -- frontend (Vite + React), http://localhost:5173
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 on the laptop itself — it starts on the
Dashboard.

### Also opening it on your phone

Both servers already bind to all network interfaces, not just
localhost, so a phone on the same Wi-Fi as the laptop can reach it too:

1. On the laptop, run `ipconfig` in Command Prompt and find the
   **IPv4 Address** for the active network adapter (e.g. `192.168.1.23`).
2. The first time the servers start, Windows may prompt with a
   **Windows Defender Firewall** dialog for Node.js -- click **Allow
   access**.
3. On the phone, connect to the same Wi-Fi and open
   `http://<that-IP>:5173` in Safari.

The phone only ever talks to that one address -- the frontend server
proxies `/api/*` calls to the backend internally on the laptop itself,
so nothing extra needs to be reachable from the phone directly.

The SQLite database file is created automatically at
`backend/data/thinking-spaces.sqlite` on first run, along with the Test
Space and its demo content.

### Eventual deployment

This will eventually be hosted at thegardners.xyz alongside the
person's other personal apps. That's a later step, once there's more
of the app worth deploying -- not something to set up yet.

### GitHub Codespaces (currently blocked)

`.devcontainer/` sets up a Codespace that installs and starts both
servers automatically, forwarding port 5173. In practice this has hit
an unresolved 401 on the forwarded port even with visibility set to
Public and confirmed via a client with no browser cookies at all,
which points at something outside this repo (likely an account- or
org-level restriction on public port forwarding) rather than a config
problem here. Not the current way to run this -- use the local/phone
setup above instead.
