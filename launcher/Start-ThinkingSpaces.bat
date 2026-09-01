@echo off
rem Everyday launcher: double-clicked from the desktop shortcut that
rem Setup-Desktop-Icon.ps1 creates (see launcher/README.md). Pulls the
rem latest code, makes sure each side's dependencies are installed, starts
rem both dev servers in their own windows, and opens the app in the
rem default browser -- the exact three manual steps README.md's "Running
rem it during development" section used to ask for by hand every time.
setlocal

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

if not exist "backend\node_modules" (
    echo Installing backend dependencies -- first run only...
    call npm install --prefix backend
)
if not exist "frontend\node_modules" (
    echo Installing frontend dependencies -- first run only...
    call npm install --prefix frontend
)

echo Starting the backend...
start "Thinking Spaces - Backend" cmd /k "cd /d "%REPO_ROOT%\backend" && npm run dev"

echo Starting the frontend...
start "Thinking Spaces - Frontend" cmd /k "cd /d "%REPO_ROOT%\frontend" && npm run dev"

rem Give Vite a moment to actually start listening before opening it --
rem the browser tab will just retry/blank-load if it loses this race
rem anyway, but a few seconds' head start avoids that in the common case.
timeout /t 3 /nobreak >nul
start "" "http://localhost:5173"

endlocal
