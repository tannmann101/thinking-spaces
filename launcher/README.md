# Desktop launcher (Windows)

A one-click alternative to the manual "two terminals, `npm run dev` in
each" steps in the root `README.md` — for running this on your own
Windows 11 machine, not for the ephemeral remote sessions this app gets
built in.

## One-time setup

1. Right-click `Setup-Desktop-Icon.ps1` in this folder and choose **Run
   with PowerShell** (or open PowerShell in this folder and run
   `.\Setup-Desktop-Icon.ps1`).
2. If Windows blocks it as an unsigned script, run this once in an
   Administrator PowerShell window, then retry step 1:
   ```powershell
   Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
   ```
3. A "Thinking Spaces" icon (the thought-bubble glyph, matching the
   app's own matte-black/oxblood/gold theme) appears on your desktop.

## Everyday use

Double-click the desktop icon. It:

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
