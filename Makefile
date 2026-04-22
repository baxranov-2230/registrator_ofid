.PHONY: help up down logs ps migrate seed test lint format backend-shell db-shell clean

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

up:
	cd infra && docker compose --env-file ../.env up -d --build

down:
	cd infra && docker compose down

logs:
	cd infra && docker compose logs -f --tail=100

ps:
	cd infra && docker compose ps

migrate:
	cd infra && docker compose exec backend uv run alembic upgrade head

seed:
	cd infra && docker compose exec backend uv run python -m app.seed

backend-shell:
	cd infra && docker compose exec backend sh

db-shell:
	cd infra && docker compose exec postgres psql -U royd -d royd

test:
	cd backend && uv run pytest -q
	cd frontend && npm test --silent || true

lint:
	cd backend && uv run ruff check app tests
	cd frontend && npm run lint || true

format:
	cd backend && uv run ruff format app tests
	cd frontend && npm run format || true

clean:
	cd infra && docker compose down -v
