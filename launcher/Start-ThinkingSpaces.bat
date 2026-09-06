@echo off
rem Everyday launcher: double-clicked from the desktop shortcut that
rem Setup-Desktop-Icon.ps1 creates (see launcher/README.md). Pulls the
rem latest code, makes sure each side's dependencies are installed,
rem creates the local database on the very first run, starts both dev
rem servers in their own windows, and opens the app in the default
rem browser -- the exact manual steps README.md's "Running it during
rem development" section used to ask for by hand every time.
rem
rem The two servers are the Worker (wrangler dev, port 8787) and the
rem frontend (Vite, port 5173). Local development runs the *same*
rem backend code the deployed site does; see CLAUDE.md's Hosting
rem section for why there's only one backend now.
setlocal

rem Don't let wrangler's first-run "send usage metrics?" prompt sit
rem waiting for an answer in a window nobody is watching.
set WRANGLER_SEND_METRICS=false

rem %~dp0 is this .bat file's own folder (launcher\); its parent is the
rem repo root, wherever the repo happens to be cloned -- so this doesn't
rem hardcode C:\Users\twglo\thinking-spaces anywhere.
set REPO_ROOT=%~dp0..
cd /d "%REPO_ROOT%"

echo Pulling latest code...
git pull
if errorlevel 1 (
    echo.
    echo git pull failed -- check the window above for details.
    echo You can still keep going with whatever code is already here.
    pause
)

if not exist "worker\node_modules" (
    echo Installing backend dependencies -- first run only...
    call npm install --prefix worker
)
if not exist "frontend\node_modules" (
    echo Installing frontend dependencies -- first run only...
    call npm install --prefix frontend
)

rem wrangler keeps the local database under worker\.wrangler. If that
rem folder isn't there yet, this is a fresh clone: create the tables and
rem seed the built-in Templates and Resource Templates. It starts with no
rem Spaces -- your real thinking lives in the deployed database, which
rem this never touches.
if not exist "worker\.wrangler" (
    echo Setting up the local database -- first run only...
    pushd "%REPO_ROOT%\worker"
    call npm run setup
    popd
)

echo Starting the backend...
start "Thinking Spaces - Backend" cmd /k "cd /d "%REPO_ROOT%\worker" && npm run dev"

echo Starting the frontend...
start "Thinking Spaces - Frontend" cmd /k "cd /d "%REPO_ROOT%\frontend" && npm run dev"

rem Give Vite a moment to actually start listening before opening it --
rem the browser tab will just retry/blank-load if it loses this race
rem anyway, but a few seconds' head start avoids that in the common case.
timeout /t 5 /nobreak >nul
start "" "http://localhost:5173"

endlocal
