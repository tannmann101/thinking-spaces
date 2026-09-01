# Desktop launcher (Windows)

Two separate desktop shortcuts, for two separate purposes:

- **`Setup-Desktop-Icon.ps1`** creates a shortcut that runs the app
  *locally* — a one-click alternative to the manual "two terminals,
  `npm run dev` in each" steps in the root `README.md`. Use this when
  making or testing changes to the code itself.
- **`Setup-Desktop-Icon-Web.ps1`** creates a shortcut that opens the
  real, deployed app at `https://thinking.thegardners.xyz` directly —
  the one to use for everyday thinking/writing once a change has
  actually shipped. No local servers, no `git pull` needed.

Both use the same thought-bubble icon (matching the app's own
matte-black/oxblood/gold theme); neither replaces the other.

## One-time setup

For either shortcut:

1. Right-click the script (`Setup-Desktop-Icon.ps1` or
   `Setup-Desktop-Icon-Web.ps1`) in this folder and choose **Run with
   PowerShell** (or open PowerShell in this folder and run
   `.\<script name>.ps1`).
2. If Windows blocks it as an unsigned script, run this once in an
   Administrator PowerShell window, then retry step 1:
   ```powershell
   Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
   ```
3. The matching icon appears on your desktop.

## Everyday use

**"Thinking Spaces"** (local): double-click it. It:

1. Runs `git pull` in the repo, so you're always on the latest code
   without doing that by hand.
2. Installs backend/frontend dependencies the first time only (skipped
   on every later run once `node_modules` exists).
3. Starts both dev servers, each in its own window (closing either
   window stops that server, same as doing it manually).
4. Opens `http://localhost:5173` in your default browser once the
   frontend has had a moment to start.

Leave the two server windows open while you're using the app; close them
(or just close the terminal windows) when you're done.

If the repo is ever moved to a different folder, re-run
`Setup-Desktop-Icon.ps1` from the new location — the shortcut it creates
points at wherever this `launcher/` folder actually lives, so it doesn't
need editing by hand.

**"Thinking Spaces (Web)"**: double-click it to open
`https://thinking.thegardners.xyz` in your default browser — nothing to
start or wait on, since it's already running. You'll see the Cloudflare
Access PIN login first, same as visiting the URL directly.
