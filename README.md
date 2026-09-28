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
| Student | `STU001` (HEMIS mock, API only) | `student1` |

The web app is for staff only. Students file and follow requests on the
university's student platform, which calls this API — see
[docs/INTEGRATION.md](docs/INTEGRATION.md).

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
`dev`. Create a real administrator with:

```bash
./create-admin.sh --prod
```

It asks nothing: the account is `admin@ndkti.uz` and a fresh random password is
printed at the end. Running it again resets that password.

Students authenticate through HEMIS, via the API only
(`/auth/hemis/exchange`, `/auth/login/hemis`); the login page has no student
option. Set `HEMIS_USE_MOCK=true` in `.env` for the offline fixtures — the mock
accepts any password for any username, so it must never be enabled outside
development. The backend refuses to start with it on when `ENV != dev`.

Staff can change their own password (Profile), reset a forgotten one by email
(`/forgot-password`), and turn on two-factor sign-in with an authenticator app.
An administrator can switch off a user's 2FA from the user dialog if they lose
their phone. Passwords need at least 10 characters with a letter and a digit.

## SLA

Deadlines count **working days only** (Mon–Fri, Asia/Tashkent), per the
Reglament 7.3: a 48-hour service filed on Friday evening is due on Tuesday
evening. Fixed public holidays are built in; the moving ones — Ramazon and
Qurbon hayit, plus any transferred days off — must be listed every year in
`SLA_HOLIDAYS` (`YYYY-MM-DD,YYYY-MM-DD`).

The clock stops while a request is returned to the student and resumes, with
the remaining time, when the student resubmits. The assignee is warned 24 hours
before the deadline; on a breach the faculty's registrators and the
department head are notified too.

## Partner platform

Every change a student must learn about — created, status changed, message,
file — is sent to `WEBHOOK_URL` as a signed webhook. Submissions carry an
`Idempotency-Key`, so a retried POST never files twice. Contract, signature
check and retry policy: [docs/INTEGRATION.md](docs/INTEGRATION.md); schema:
`docs/openapi.json` (`make openapi` regenerates it).

Emails and webhooks go through a database outbox and are retried, so a restart
never loses one.

## Roles

| Role | Can do |
|---|---|
| `student` | API only (partner platform): create requests, read, message and resubmit their own |
| `staff` | work the requests assigned to them, post internal notes |
| `registrator` | see everything, assign, return, transition |
| `admin` | everything, plus users and catalogs |
| `leadership` | **read-only**: all requests, audit trail, KPI reports |

The matrix lives in `backend/app/models/role.py`; `frontend/src/app/router.tsx`
and the sidebar mirror it. Change all three together.

## Commands

```bash
make up          # start the dev stack
make down        # stop
make logs        # tail all services
make migrate     # alembic upgrade head
make seed        # dev data (dev only)
make test        # backend pytest + frontend unit tests + build
make openapi     # regenerate docs/openapi.json
make lint        # ruff + eslint + tsc
make format      # ruff format + prettier
```

Deployment and operations go through `./deploy.sh`:

```bash
./deploy.sh status              # what is running, and where
./deploy.sh backup              # database + uploads → backups/
./deploy.sh --prod backup-cron  # daily backup at 02:00 (ROYD_BACKUP_REMOTE=... copies off-server)
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
cd frontend && npm test              # unit tests (vitest)
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
- **Phase 2:** KPI reports and 2FA — done; Telegram bot
- **Phase 3:** analytics dashboards, AI FAQ assistant
- **Phase 4:** mobile PWA, LDAP SSO
