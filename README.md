# Thinking Spaces

See `CLAUDE.md` for the full project brief, architecture, and roadmap.

## Status

Pass 1 scaffold: plumbing only, no features. The frontend calls a
backend health-check endpoint and displays the result, proving the two
sides can talk to each other.

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

Open http://localhost:5173 — it should show a "Backend connection
check" with status `ok` and a space count from the database.

The Vite dev server proxies `/api/*` requests to the backend
(`frontend/vite.config.js`), so the frontend code just calls
`fetch('/api/health')` without worrying about ports.

The SQLite database file is created automatically at
`backend/data/thinking-spaces.sqlite` on first run.
