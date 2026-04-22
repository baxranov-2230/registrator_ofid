#!/bin/sh
set -e
cd /app
uv sync --no-dev
uv run alembic upgrade head
exec uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
