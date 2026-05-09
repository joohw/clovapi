#!/usr/bin/env bash
set -euo pipefail

BACKEND_PORT="${BACKEND_PORT:-3500}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
FRONTEND_BASE_URL="${FRONTEND_BASE_URL:-http://127.0.0.1:${FRONTEND_PORT}}"

PORT="${BACKEND_PORT}" FRONTEND_BASE_URL="${FRONTEND_BASE_URL}" /new-api &
BACKEND_PID=$!

FRONTEND_NEXT_BIN="/app/frontend/node_modules/next/dist/bin/next"
if [ ! -f "${FRONTEND_NEXT_BIN}" ]; then
  echo "next start entry not found under /app/frontend/node_modules" >&2
  ls -la /app/frontend >&2 || true
  exit 1
fi

cd /app/frontend
PORT="${FRONTEND_PORT}" HOSTNAME="0.0.0.0" node "${FRONTEND_NEXT_BIN}" start -p "${FRONTEND_PORT}" -H "0.0.0.0" &
FRONTEND_PID=$!

cleanup() {
  kill "${BACKEND_PID}" "${FRONTEND_PID}" 2>/dev/null || true
  wait "${BACKEND_PID}" "${FRONTEND_PID}" 2>/dev/null || true
}

trap cleanup TERM INT

wait -n "${BACKEND_PID}" "${FRONTEND_PID}"
status=$?
cleanup
exit "${status}"
