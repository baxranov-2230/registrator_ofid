#!/bin/sh
set -e
cd /app

echo "Waiting for postgres to be resolvable..."
for i in $(seq 1 30); do
    if .venv/bin/python -c "import socket; socket.gethostbyname('postgres')" 2>/dev/null; then
        echo "postgres resolvable"
        break
    fi
    echo "  attempt $i: postgres not yet resolvable, sleep 1"
    sleep 1
done

echo "Running migrations..."
.venv/bin/alembic upgrade head

echo "Starting uvicorn..."
exec .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
