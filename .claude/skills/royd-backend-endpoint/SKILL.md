---
name: royd-backend-endpoint
description: Conventions for adding or changing a FastAPI endpoint in the ROYD backend — layering between api/v1 routers and services, role guards and row-level scoping, audit logging, notifications, and commit discipline. Use whenever touching anything under backend/app/api or backend/app/services.
---

# Adding a backend endpoint (ROYD)

## Layering — do not mix these

| Layer | File | Responsibility |
|---|---|---|
| HTTP | `app/api/v1/<domain>.py` | auth guard, request/response schemas, audit log, notifications, **the single `await db.commit()`** |
| Business | `app/services/<domain>_service.py` | validation, state machine, DB reads/writes, `await db.flush()` — **never commits** |
| Data | `app/models/<domain>.py` | SQLAlchemy 2.0 `Mapped[...]` models |

A service that commits breaks the endpoint's ability to roll back a partial write. Keep it at `flush()`.

## Checklist for a new endpoint

1. **Schemas** in `app/schemas/<domain>.py`. Separate `XCreate` (input, with `Field(min_length=…)` constraints) from `XOut` (output, `model_config = ConfigDict(from_attributes=True)`). Never return an ORM model directly.
2. **Route** in the existing `router = APIRouter(prefix=…, tags=[…])`. New router files must be registered in `app/api/v1/router.py`.
3. **Auth** — every route needs one:
   - `user: User = Depends(get_current_user)` when you need the caller.
   - `dependencies=[Depends(require_roles(Role.ADMIN, …))]` when you only need the gate.
   - Role constants live on `Role` (`app/models/role.py`), never string literals.
4. **Row-level scoping is separate from the role gate.** `require_roles(Role.STAFF)` proves *what* the caller is, not *which rows* they may touch. For requests, always go through `get_request_for_user(db, request_id, user)` — it filters students to their own rows and staff to their assigned rows. Any new owned resource needs the equivalent.
5. **Audit** every mutation before the commit:
   ```python
   await log_action(db, user_id=actor.id, action="request.assign",
                    entity_type="request", entity_id=req.id,
                    old_value={...}, new_value={...})
   ```
   Action names are dotted `<entity>.<verb>`.
6. **Notifications** — `await create_notification(db, …)` writes an in-app row in the same transaction; `enqueue_email(...)` is fire-and-forget and must never be awaited in the request path.
7. **Commit once**, at the end of the endpoint, then re-read with eager loads if you return a detail model.

## Async SQLAlchemy rules

- Lazy loading raises at runtime under asyncio. Every relationship you serialise must be eager-loaded: `.options(selectinload(Model.rel))`.
- Use `(await db.execute(stmt)).scalar_one_or_none()`; reserve `scalar_one()` for rows guaranteed to exist (e.g. seeded roles).
- Timestamps: `datetime.now(UTC)`. Never `datetime.utcnow()` — columns are `DateTime(timezone=True)` and naive values corrupt comparisons.

## Errors

Raise `HTTPException` from the service layer with the correct code: `400` invalid input, `403` authorised-but-forbidden, `404` missing or not-visible, `409` conflict, `413/415` upload problems. User-facing `detail` strings are Uzbek; keep that consistent.

Uniqueness checks (`email`, `code`, `tracking_no`) race — the DB constraint is the real guard, so catch `IntegrityError` and return `409` rather than letting a 500 escape.

## Before you call it done

```bash
uvx ruff@0.7.0 check app tests     # backend/.venv is root-owned, so uv run may fail
```

Add a test in `backend/tests/`. Auth, the request state machine, and row-scoping are the parts worth covering.
