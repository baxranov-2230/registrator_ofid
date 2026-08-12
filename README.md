# Registrator Ofis – Yagona Darcha Tizimi (ROYD)

University single-window platform for student request management, SLA tracking, and staff KPI.

## Stack

- **Backend:** FastAPI + SQLAlchemy 2.0 (async) + Alembic + PostgreSQL 16 + Redis 7
- **Frontend:** Vite + React 18 + TypeScript + MUI v5 + Redux Toolkit + RTK Query
- **Infra:** Docker Compose (postgres, redis, backend, frontend, nginx, mailhog)

## Quick start

```bash
cp .env.example .env          # ports and secrets for the dev stack

make up                       # build + start every service
make migrate                  # apply the schema
make seed                     # dev users and catalogs
```

Everything is reached through nginx. **Ports come from the root `.env`**, and
the defaults are not the framework defaults:

| What | URL |
|---|---|
| **Application** | **http://localhost:8080** ← start here |
| API (direct) | http://localhost:8001 |
| API docs (dev only) | http://localhost:8001/api/docs |
| Vite dev server (direct) | http://localhost:5174 |
| MailHog | http://localhost:8025 |
| Postgres | `localhost:5433` |
| Redis | `localhost:6380` |

## Dev login (seeded)

| Role | Email | Password |
|---|---|---|
| Admin | `admin@royd.uz` | `admin123` |
| Registrator (IT fakulteti) | `registrator@royd.uz` | `reg123` |
| Registrator (Iqtisodiyot) | `registrator2@royd.uz` | `reg123` |
| Leadership | `leadership@royd.uz` | `lead123` |
| Staff | `staff1@royd.uz` | `staff123` |
| Student | `STU001` (HEMIS) | `student1` |

## Murojaatlarni avtomatik yo'naltirish

Talaba murojaat yuborganda xodimni tanlamaydi. Tizim talabaning fakultetini
aniqlab, o'sha fakultetga biriktirilgan Registrator ofis xodimiga murojaatni
avtomatik biriktiradi:

- fakultetga **bitta** registrator biriktirilgan bo'lsa — murojaat o'shanga tushadi;
- **bir nechta** bo'lsa — ochiq murojaatlari eng kam bo'lgan xodimga beriladi;
- **hech kim** biriktirilmagan bo'lsa — murojaat yaratilmaydi va talabaga
  tushunarli xatolik (409) ko'rsatiladi, chunki noto'g'ri xodimga biriktirish
  murojaatni yo'qotib qo'yadi.

Shuning uchun **har bir faol fakultetga kamida bitta registrator biriktirilgan
bo'lishi kerak**: Admin → Foydalanuvchilar → xodimni tahrirlab, fakultetini
tanlang.

These passwords are public, so `make seed` refuses to run when `ENV` is not
`dev`. Use `./deploy.sh admin <email> <password>` to create the first real
administrator.

Student login goes through HEMIS. Set `HEMIS_USE_MOCK=true` in `.env` for the
offline fixtures — the mock accepts any password for any username, so it must
never be enabled outside development. The backend refuses to start with it on
when `ENV != dev`.

## Roles

| Role | Can do |
|---|---|
| `student` | create requests, read and message on their own |
| `staff` | work the requests assigned to them, post internal notes |
| `registrator` | see everything, assign, return, transition |
| `admin` | everything, plus users and catalogs |
| `leadership` | **read-only**: all requests, audit trail, reports |

The matrix lives in `backend/app/models/role.py`; `frontend/src/app/router.tsx`
and the sidebar mirror it. Change all three together.

## Commands

```bash
make up          # start the dev stack
make down        # stop
make logs        # tail all services
make migrate     # alembic upgrade head
make seed        # dev data (dev only)
make test        # backend pytest + frontend build
make lint        # ruff + eslint + tsc
make format      # ruff format + prettier
```

Deployment and operations go through `./deploy.sh`:

```bash
./deploy.sh status              # what is running, and where
./deploy.sh backup              # database + uploads → backups/
./deploy.sh restore <file>      # restore a database dump
./deploy.sh --prod up           # production stack (see DEPLOY.md)
```

## Local development notes

- The backend container runs as a non-root user and keeps its virtualenv at
  `/opt/venv`, outside the bind mount, so host-side tooling keeps working.
- Use the local binaries in `frontend/`: `./node_modules/.bin/tsc`,
  `./node_modules/.bin/eslint`. Bare `npx` resolves to unrelated packages here.
- `npm run build` runs `tsc -b` first, so a type error fails the build.

## Testing

```bash
cd backend  && uv run pytest -q      # integration tests over the real routes
cd frontend && npm run build         # typecheck + bundle
```

The backend suite runs against an in-memory SQLite database with a fake Redis,
so it needs no running services.

## Project structure

```
backend/
  app/api/v1/      HTTP routes — auth, permissions, audit, commit
  app/services/    business logic — validation, state machine, no commits
  app/models/      SQLAlchemy models and the role matrix
  app/middleware/  rate limiting, security headers
  tests/           integration tests
frontend/
  src/features/    one folder per domain (requests, admin, auth, notifications)
  src/shared/      cross-feature api client, components, i18n
infra/             Docker Compose (dev + prod), Dockerfiles, nginx configs
.claude/skills/    project conventions for AI-assisted work
```

## Roadmap

- **Phase 1 (MVP):** auth, request lifecycle, notifications, SLA tracking, dashboard — done
- **Phase 2:** KPI reports, Telegram bot, 2FA
- **Phase 3:** analytics dashboards, AI FAQ assistant
- **Phase 4:** mobile PWA, LDAP SSO
