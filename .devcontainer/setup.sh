#!/bin/bash
# Installs both npm projects independently -- if one fails, the other
# still installs instead of silently never running, which is what
# happens with `cd worker && npm install && cd ../frontend && npm install`.
set -uo pipefail
cd "$(dirname "$0")/.."

echo "== Installing backend (Worker) dependencies =="
npm install --prefix worker
WORKER_STATUS=$?

echo "== Installing frontend dependencies =="
npm install --prefix frontend
FRONTEND_STATUS=$?

if [ "$WORKER_STATUS" -ne 0 ]; then
  echo "!! worker npm install FAILED (see output above). Fix the error, then run: npm install --prefix worker"
fi
if [ "$FRONTEND_STATUS" -ne 0 ]; then
  echo "!! frontend npm install FAILED (see output above). Fix the error, then run: npm install --prefix frontend"
fi

# The local database wrangler dev runs against. Created once: the tables
# plus the built-in Templates and Resource Templates, no Spaces.
if [ "$WORKER_STATUS" -eq 0 ] && [ ! -d worker/.wrangler ]; then
  echo "== Creating the local database =="
  npm --prefix worker run setup
fi
