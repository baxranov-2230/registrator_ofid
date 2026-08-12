#!/usr/bin/env bash
# Admin qo'shish. Hech narsa so'ramaydi.
#
#   ./create-admin.sh          — dev
#   ./create-admin.sh --prod   — server
#
# Oxirida email va parolni chop etadi — parolni saqlab qo'ying.

set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Shu yerni o'zgartiring ──────────────────────────────────────────────────
EMAIL="baxranovahror2230@gmail.com"
PASSWORD="ahror2230"
NAME="Administrator"
# ────────────────────────────────────────────────────────────────────────────

if [ "${1:-}" = "--prod" ]; then
  COMPOSE="docker compose -f infra/docker-compose.prod.yml --env-file .env.prod"
else
  COMPOSE="docker compose -f infra/docker-compose.yml --env-file .env"
fi

# Parol environment orqali uzatiladi — matnga qo'yilsa `$` yoki backtick
# bo'lgan parol jimgina buzilib ketardi.
$COMPOSE exec -T \
  -e A_EMAIL="$EMAIL" -e A_PASS="$PASSWORD" -e A_NAME="$NAME" \
  backend sh -c 'PYTHONPATH=/app /opt/venv/bin/python -c "
import asyncio, os
from sqlalchemy import select
from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models import Employee, Role, User

async def main():
    email, password = os.environ[\"A_EMAIL\"], os.environ[\"A_PASS\"]
    async with SessionLocal() as db:
        role = (await db.execute(select(Role).where(Role.name == \"admin\"))).scalar_one()
        user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if user:
            user.password_hash = hash_password(password)
            user.is_active = True
        else:
            user = User(full_name=os.environ[\"A_NAME\"], email=email,
                        password_hash=hash_password(password),
                        role_id=role.id, is_active=True)
            db.add(user)
        await db.flush()
        # Xodim profili 0005 migratsiyasidan beri alohida jadvalda.
        if not (await db.execute(
                select(Employee).where(Employee.user_id == user.id))).scalar_one_or_none():
            db.add(Employee(user_id=user.id))
        await db.commit()

asyncio.run(main())
"'

echo
echo "  Email:  $EMAIL"
echo "  Parol:  $PASSWORD"
echo
echo "  Parolni saqlab qo'ying — u boshqa hech qayerda saqlanmaydi."
