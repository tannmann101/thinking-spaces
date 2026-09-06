# Thinking Spaces

See `CLAUDE.md` for the full project brief, architecture, and roadmap.

## Status

Live at https://thinking.thegardners.xyz, gated behind the same
Cloudflare Access PIN as the rest of that domain. The full app is
built -- Spaces, Tools, Workspaces, Projects, Goals, Insights, Reports,
Trail, search, export and trash. `CLAUDE.md` is the real record of what
exists and why.

## Running it during development

### The easy way: the desktop launcher

See `launcher/README.md` -- a one-time setup script creates a "Thinking
Spaces" desktop icon (matching the app's own theme) that pulls the
latest code and starts both servers for you. This is the everyday path;
the manual steps below are what it's doing under the hood, and are still
useful if you ever want to run a command yourself (e.g. to read an error
a server window scrolled past).

### The manual way

Run it on your own machine (a Windows 11 laptop) with two servers, in
two terminals. The first time only, create the local database:

```bash
cd worker
npm install
npm run setup   # tables + the built-in Templates, no Spaces
```

Then, every time:

```bash
# Terminal 1 -- the backend (Cloudflare Worker + D1), http://localhost:8787
cd worker
npm run dev

# Terminal 2 -- frontend (Vite + React), http://localhost:5173
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 on the laptop itself -- it starts on the
Dashboard.

This runs the *same* backend code the deployed site does, against a
local database wrangler keeps under `worker/.wrangler/`. Nothing here
touches the real deployed data; a local database starts empty apart
from the built-in Templates.

### On your phone

The live site installs to a phone's home screen: open
https://thinking.thegardners.xyz in Safari, tap Share, then **Add to
Home Screen**. It opens without browser chrome, and quick capture is a
tap away in the top bar -- type a thought, hit return, and it lands in
your Inbox without taking you anywhere.

One thing to expect the first time: an installed iOS web app may not
share Safari's cookies, so the Cloudflare Access PIN will probably need
entering once inside the installed app. Once, not per launch.

### Opening the local dev server on your phone

The frontend server already binds to all network interfaces, not just
localhost, so a phone on the same Wi-Fi as the laptop can reach it too.
The Worker doesn't need to -- the phone only ever talks to the frontend,
which proxies `/api/*` to the Worker on the laptop itself:

1. On the laptop, run `ipconfig` in Command Prompt and find the
   **IPv4 Address** for the active network adapter (e.g. `192.168.1.23`).
2. The first time the servers start, Windows may prompt with a
   **Windows Defender Firewall** dialog for Node.js -- click **Allow
   access**.
3. On the phone, connect to the same Wi-Fi and open
   `http://<that-IP>:5173` in Safari.

### Deployment

Both halves deploy themselves on a push to `main`: the frontend to
GitHub Pages, and the Worker to Cloudflare (after its test suite
passes). A schema change is the one thing still applied by hand -- the
Worker workflow refuses to ship ahead of one. See `worker/DEPLOY.md`.

### GitHub Codespaces (currently blocked)

`.devcontainer/` sets up a Codespace that installs and starts both
servers automatically, forwarding port 5173. In practice this has hit
an unresolved 401 on the forwarded port even with visibility set to
Public and confirmed via a client with no browser cookies at all,
which points at something outside this repo (likely an account- or
org-level restriction on public port forwarding) rather than a config
problem here. Not the current way to run this -- use the local/phone
setup above instead.
