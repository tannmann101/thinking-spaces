#!/bin/bash
# Installs both npm projects independently -- if one fails (e.g. the
# backend's native better-sqlite3 build), the other still installs
# instead of silently never running, which is what happens with
# `cd backend && npm install && cd ../frontend && npm install`.
set -uo pipefail
cd "$(dirname "$0")/.."

echo "== Installing backend dependencies =="
npm install --prefix backend
BACKEND_STATUS=$?

echo "== Installing frontend dependencies =="
npm install --prefix frontend
FRONTEND_STATUS=$?

if [ "$BACKEND_STATUS" -ne 0 ]; then
  echo "!! backend npm install FAILED (see output above). Fix the error, then run: npm install --prefix backend"
fi
if [ "$FRONTEND_STATUS" -ne 0 ]; then
  echo "!! frontend npm install FAILED (see output above). Fix the error, then run: npm install --prefix frontend"
fi
