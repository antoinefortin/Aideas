#!/usr/bin/env sh
# Serves Wake locally and opens it in the browser.
# Usage: ./run.sh [port]
set -e
cd "$(dirname "$0")"
PORT="${1:-8754}"
URL="http://localhost:$PORT/"
echo "Wake → $URL  (Ctrl+C to stop)"
( sleep 1; (command -v open >/dev/null && open "$URL") || (command -v xdg-open >/dev/null && xdg-open "$URL") || true ) &
exec python3 -m http.server "$PORT"
