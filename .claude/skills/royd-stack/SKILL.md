---
name: royd-stack
description: Running, inspecting, and debugging the ROYD Docker stack — ports, make targets, seeded logins, HEMIS mock toggle, and the known environment gotchas. Use when starting the app, reading logs, reproducing a bug end to end, or when a local tool suddenly cannot run.
---

# Running the ROYD stack

Six containers from `infra/docker-compose.yml`, all reached through nginx. Ports come from the root `.env`, and they are **not** the defaults in the README:

| Service | Host port | Notes |
|---|---|---|
| nginx | 8080 | the real entry point — `/api/`, `/ws/`, `/hemis/`, `/` |
| backend | 8001 | FastAPI direct; docs at `/api/docs` |
| frontend | 5174 | Vite dev server |
| postgres | 5433 | |
| redis | 6380 | |
| mailhog | 8025 | web UI, catches all outbound mail |

## Commands

```bash
make up            # build + start everything
make logs          # tail all services
make migrate       # alembic upgrade head
make seed          # idempotent dev data
make down          # stop
make clean         # stop AND drop volumes (destroys the database)
```

All targets shell out to `docker compose --env-file ../.env`; running `docker compose` from `infra/` without that flag picks up the wrong ports.

Health check: `curl -s http://127.0.0.1:8001/healthz`.

## Seeded logins (`make seed`)

| Role | Credentials |
|---|---|
| admin | `admin@royd.uz` / `admin123` |
| registrator | `registrator@royd.uz` / `reg123` |
| leadership | `leadership@royd.uz` / `lead123` |
| staff | `staff1@royd.uz` / `staff123` |
| student | HEMIS flow — `STU001` / `student1` (needs `HEMIS_USE_MOCK=true`) |

`make seed` refuses to run when `ENV != dev`: these passwords are public.

## HEMIS

Two paths, controlled by `HEMIS_USE_MOCK`:

- **Mock** (`app/services/hemis_mock.py`): fixtures for `STU001` etc. Any *unknown* username with any non-empty password also succeeds and auto-creates a student — a full auth bypass, so it defaults to **off** and the backend refuses to start with it enabled when `ENV != dev`. Set `HEMIS_USE_MOCK=true` in `.env` to work offline.
- **Real** (default): points at `https://student.ndki.uz`. The browser can also authenticate directly via the nginx `/hemis/auth/login` proxy — only that one path is exposed, and it is rate limited — then exchange the token at `POST /api/v1/auth/hemis/exchange`.

## Known gotchas

- **The container's virtualenv is at `/opt/venv`, not `backend/.venv`.** It lives outside the bind mount so the container (which runs as the unprivileged `app` user) cannot clobber the host's copy. Inside the container use `/opt/venv/bin/...`; on the host, `backend/.venv` is yours to manage with `uv sync`.
- **A repo checked out before this change may still have a root-owned `backend/.venv`** left by the old root container. `make fix-perms` removes it.
- **Frontend tooling:** use `./node_modules/.bin/tsc` and `./node_modules/.bin/eslint`. Bare `npx` resolves to unrelated registry packages here.
- **`npm install` runs on every frontend container start**, so first boot after `make up` takes a while — the app is not broken, it is installing.
- The dev compose is development-only (`ENV: dev`, `--reload`, MailHog, exposed database ports). Production uses `infra/docker-compose.prod.yml` via `./deploy.sh --prod up`, which builds the frontend, runs multiple workers and terminates TLS.

## Production stack

```bash
./deploy.sh --prod up        # infra/docker-compose.prod.yml + .env.prod
./deploy.sh backup           # pg_dump + uploads → backups/
./deploy.sh restore <file>   # restore a dump
```

`.env.prod` must define `SERVER_NAME`, `JWT_SECRET` (32+ random chars),
`POSTGRES_PASSWORD` and the `SMTP_*` values. The backend validates these at
startup and refuses to boot on development defaults — that is intentional.

## Reproducing an end-to-end flow

1. `make up && make migrate && make seed`
2. Log in as a student, create a request → `POST /api/v1/requests`
3. Log in as registrator, assign it → `POST /api/v1/requests/{id}/assign`
4. Log in as staff, transition it → `POST /api/v1/requests/{id}/transition`
5. Check the resulting mail in MailHog (`http://localhost:8025`) and the audit trail at `GET /api/v1/admin/audit` as admin.
