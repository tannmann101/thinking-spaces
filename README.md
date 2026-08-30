# Thinking Spaces

See `CLAUDE.md` for the full project brief, architecture, and roadmap.

## Status

Pass 2 in progress: all five Block types (Text, List, Reference, Media,
Comparison) and all four List-based Views (Timeline, Progress, Streak,
Ledger) are implemented and demoed in the Test Space, along with a
basic backlink lookup. No Templates yet, no Dev Mode, no cross-Space
Graph view.

## Seeing it running: GitHub Codespaces

The fastest way to open the app in a browser without installing
anything locally:

1. On this repo's GitHub page, click **Code > Codespaces > Create
   codespace on main**.
2. Wait for it to finish setting up (installs both `npm` projects
   automatically, then starts both dev servers).
3. A "Thinking Spaces" port-forward notification should pop up — click
   **Open in Browser**. If it doesn't, open the **Ports** tab and click
   the globe icon next to port `5173`.

The Test Space (with every Block type and View demoed) is linked from
the Dashboard. Since this runs inside the Codespace's own container,
the SQLite data resets whenever the Codespace restarts -- expected for
now, since everything in it is seed/demo data anyway.

## Running it locally

Two servers, in two terminals:

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

Open http://localhost:5173 — it starts on the Dashboard.

The Vite dev server proxies `/api/*` requests to the backend
(`frontend/vite.config.js`), so the frontend code just calls
`fetch('/api/...')` without worrying about ports.

The SQLite database file is created automatically at
`backend/data/thinking-spaces.sqlite` on first run, along with the Test
Space and its demo content.
