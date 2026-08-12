.PHONY: help up down logs ps migrate seed test lint format backend-shell db-shell clean backup fix-perms

help:
	@echo "ROYD dev commands:"
	@echo "  make up         — start all services (postgres/redis/mailhog/backend/frontend)"
	@echo "  make down       — stop services"
	@echo "  make logs       — tail all logs"
	@echo "  make migrate    — run alembic upgrade head"
	@echo "  make seed       — populate dev seed data"
	@echo "  make test       — run backend + frontend tests"
	@echo "  make lint       — run ruff + eslint"
	@echo "  make format     — auto-format code"
	@echo "  make backup     — database + uploads backup"
	@echo "  make fix-perms  — remove a stale root-owned backend/.venv"

up:
	cd infra && docker compose --env-file ../.env up -d --build

down:
	cd infra && docker compose --env-file ../.env down

logs:
	cd infra && docker compose --env-file ../.env logs -f --tail=100

ps:
	cd infra && docker compose --env-file ../.env ps

migrate:
	cd infra && docker compose --env-file ../.env exec backend /opt/venv/bin/alembic upgrade head

seed:
	cd infra && docker compose --env-file ../.env exec backend /opt/venv/bin/python -m app.seed

backend-shell:
	cd infra && docker compose --env-file ../.env exec backend sh

db-shell:
	cd infra && docker compose --env-file ../.env exec postgres psql -U royd -d royd

backup:
	./deploy.sh backup

# The container used to run as root over the bind mount and left backend/.venv
# root-owned, which broke host-side tooling. Builds no longer do this (the venv
# lives at /opt/venv), but an existing repo may still have the stale directory.
fix-perms:
	@if [ -d backend/.venv ] && [ ! -w backend/.venv ]; then \
		echo "Removing stale root-owned backend/.venv (needs sudo)..."; \
		sudo rm -rf backend/.venv; \
		echo "Done — run 'cd backend && uv sync' to recreate it."; \
	else \
		echo "backend/.venv is fine."; \
	fi

# No `|| true`: a failing test or lint run must fail the target.
test:
	cd backend && uv run pytest -q
	cd frontend && npm run build

lint:
	cd backend && uv run ruff check app tests
	cd backend && uv run ruff format --check app tests
	cd frontend && ./node_modules/.bin/eslint . --ext .ts,.tsx
	cd frontend && node scripts/check-i18n.mjs

format:
	cd backend && uv run ruff format app tests
	cd frontend && npm run format

clean:
	cd infra && docker compose --env-file ../.env down -v
