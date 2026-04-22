# Registrator Ofis – Yagona Darcha Tizimi (ROYD)

University single-window platform for student request management, SLA tracking, and staff KPI.

## Stack

- **Backend:** FastAPI + SQLAlchemy 2.0 (async) + Alembic + PostgreSQL 16 + Redis 7
- **Frontend:** Vite + React 18 + TypeScript + MUI v5 + Redux Toolkit + RTK Query
- **Infra:** Docker Compose (postgres, redis, backend, frontend, mailhog)

## Quick start

```bash
# Copy env templates
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# Boot everything
make up

# Apply schema + seed dev data
make migrate
make seed

# Open
#   Frontend  http://localhost:5173
#   API docs  http://localhost:8000/api/docs
#   MailHog   http://localhost:8025
```

## Dev login (seeded)

| Role         | Email               | Password   |
|--------------|---------------------|------------|
| Admin        | admin@royd.uz       | admin123   |
| Registrator  | registrator@royd.uz | reg123     |
| Staff        | staff1@royd.uz      | staff123   |
| Student      | `STU001` (HEMIS)    | `student1` |

Student login uses the HEMIS flow (mocked in dev).

## Commands

```bash
make up          # docker-compose up -d
make down        # stop containers
make logs        # tail all service logs
make migrate     # run alembic migrations
make seed        # populate dev seed data
make test        # run backend + frontend tests
make lint        # run ruff + mypy + eslint
make format      # auto-format code
```

## Project structure

```
backend/    FastAPI app (auth, requests, notifications, admin)
frontend/   React SPA (student, registrator, staff, admin modules)
infra/      Docker Compose, Dockerfiles, nginx config
docs/       Architecture notes, OpenAPI exports
```

## Roadmap

- **Phase 1 (MVP):** auth + request CRUD + basic notifications (current)
- **Phase 2:** SLA engine, KPI, Telegram bot, 2FA
- **Phase 3:** analytics dashboards, AI FAQ assistant
- **Phase 4:** mobile PWA, LDAP SSO, production hardening
