#!/bin/sh
set -e
cd /app

# The venv lives outside /app so the dev bind-mount cannot clobber it.
VENV="${UV_PROJECT_ENVIRONMENT:-/opt/venv}"
PY="$VENV/bin/python"

echo "Waiting for postgres..."
for i in $(seq 1 30); do
    if "$PY" -c "import socket; socket.gethostbyname('postgres')" 2>/dev/null; then
        echo "postgres resolvable"
        break
    fi
    echo "  attempt $i: postgres not yet resolvable, sleep 1"
    sleep 1
done

echo "Running migrations..."
"$VENV/bin/alembic" upgrade head

# --reload only in dev; production runs multiple workers instead.
if [ "${ENV:-dev}" = "dev" ]; then
    echo "Starting uvicorn (dev, autoreload)..."
    exec "$VENV/bin/uvicorn" app.main:app --host 0.0.0.0 --port 8000 --reload
else
    echo "Starting uvicorn (production, ${UVICORN_WORKERS:-4} workers)..."
    exec "$VENV/bin/uvicorn" app.main:app --host 0.0.0.0 --port 8000 \
        --workers "${UVICORN_WORKERS:-4}" --proxy-headers --forwarded-allow-ips='*'
fi
