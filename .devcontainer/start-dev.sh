#!/bin/bash
# Starts both dev servers in the background when the Codespace (re)starts,
# so opening the forwarded port just works without any manual commands.
set -e
cd "$(dirname "$0")/.."

mkdir -p /tmp/thinking-spaces-logs
nohup npm --prefix backend run dev > /tmp/thinking-spaces-logs/backend.log 2>&1 &
nohup npm --prefix frontend run dev > /tmp/thinking-spaces-logs/frontend.log 2>&1 &
