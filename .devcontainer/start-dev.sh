#!/bin/bash
# Starts both dev servers in the background when the Codespace (re)starts,
# so opening the forwarded port just works without any manual commands.
cd "$(dirname "$0")/.."

mkdir -p /tmp/thinking-spaces-logs

# Self-healing: if postCreateCommand failed for either project (e.g. a
# transient network error, or better-sqlite3's native build failing),
# node_modules won't exist. Retry the install here rather than silently
# starting nothing and leaving the forwarded port a 404.
if [ ! -d backend/node_modules ]; then
  echo "backend/node_modules missing -- retrying install" >> /tmp/thinking-spaces-logs/backend.log
  npm install --prefix backend >> /tmp/thinking-spaces-logs/backend.log 2>&1
fi
if [ ! -d frontend/node_modules ]; then
  echo "frontend/node_modules missing -- retrying install" >> /tmp/thinking-spaces-logs/frontend.log
  npm install --prefix frontend >> /tmp/thinking-spaces-logs/frontend.log 2>&1
fi

nohup npm --prefix backend run dev >> /tmp/thinking-spaces-logs/backend.log 2>&1 &
nohup npm --prefix frontend run dev >> /tmp/thinking-spaces-logs/frontend.log 2>&1 &
