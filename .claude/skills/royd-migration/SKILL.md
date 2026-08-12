---
name: royd-migration
description: Alembic workflow for the ROYD backend — changing a SQLAlchemy model, generating and reviewing a revision, and applying it in Docker. Use whenever a model under backend/app/models changes or a migration needs writing, reviewing, or rolling back.
---

# Database migrations (ROYD)

Postgres 16 + SQLAlchemy 2.0 async + Alembic. Migrations live in `backend/alembic/versions/`, named `000N_short_name.py` in a linear chain (`0001_initial` → `0002_student_profile_fields` → `0003_student_groups`).

## Workflow

1. **Edit the model** in `backend/app/models/<domain>.py`.
2. **Export it** from `app/models/__init__.py`. Alembic autogenerate diffs `Base.metadata`, so a model that is never imported is invisible and gets silently dropped from the diff.
3. **Generate**, against a running database:
   ```bash
   cd infra && docker compose --env-file ../.env exec backend \
     /opt/venv/bin/alembic revision --autogenerate -m "add x to y"
   ```
4. **Review the generated file — always.** Autogenerate reliably misses or mangles:
   - column type changes (it drops and recreates, losing data),
   - `server_default` (it only sees the Python-side `default=`),
   - index and constraint renames,
   - anything on `JSONB` columns.
   Rename the file to the `000N_` convention and check `down_revision` points at the current head.
5. **Write a real `downgrade()`.** A `pass` body means the revision cannot be rolled back on the server.
6. **Apply**: `make migrate` (or `docker compose exec backend /opt/venv/bin/alembic upgrade head`).

`backend/entrypoint.sh` runs `alembic upgrade head` on every container start, so a broken revision takes the backend down on boot, not at deploy time.

## Conventions in this schema

- Timestamps are `DateTime(timezone=True)` with a Python default of `lambda: datetime.now(UTC)`. Never `datetime.utcnow()` — it produces a naive value in a tz-aware column.
- Child tables use `ForeignKey(..., ondelete="CASCADE")` plus `cascade="all, delete-orphan"` on the relationship (see `request_history`, `request_files`, `messages`).
- Status and role values are plain `String(32)` columns validated in Python (`RequestStatus`, `Role`), not Postgres enums. Adding a value is a code change, not a migration — but nothing at the DB level enforces the set, so validate on write.
- Any column a list endpoint filters or sorts on needs an index. Composite indexes go in `__table_args__`.

## Data migrations

Seed and backfill logic belongs in the revision's `upgrade()` using `op.execute(...)` or `op.bulk_insert(...)`. `app/seed.py` is dev-only and idempotent — do not rely on it for production data.

## Verifying

```bash
make db-shell            # psql into the container
\d+ requests             # inspect the applied schema
```
Then re-run `alembic revision --autogenerate` and confirm the diff is empty — a non-empty diff means the models and the schema have drifted.
