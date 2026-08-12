#!/usr/bin/env bash
# ROYD — administrator (yoki boshqa xodim) hisobini yaratish/yangilash.
#
# Foydalanish:
#   ./create-admin.sh                                  # so'rab-so'rab (interaktiv)
#   ./create-admin.sh admin@ndkti.uz                   # parolni yashirin so'raydi
#   ./create-admin.sh admin@ndkti.uz 'Parol' "F.I.Sh"  # to'liq argument bilan
#   ./create-admin.sh --prod admin@ndkti.uz            # production stack'ida
#   ./create-admin.sh --role registrator r@ndkti.uz    # boshqa rol bilan
#   ./create-admin.sh --list                           # mavjud xodimlarni ko'rish
#
# Parol hech qachon buyruq matniga yoki python kodiga qo'yilmaydi — u faqat
# environment orqali uzatiladi, aks holda `$`, backtick yoki qo'shtirnoq
# bo'lgan parol jimgina buzilar (yoki bajarilib ketar) edi.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

MODE="${ROYD_ENV:-dev}"
ROLE="admin"
LIST_ONLY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --prod) MODE="prod"; shift ;;
    --dev)  MODE="dev";  shift ;;
    --role) ROLE="${2:-}"; shift 2 ;;
    --list) LIST_ONLY=1; shift ;;
    -h|--help)
      sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    --*) echo "Noma'lum parametr: $1" >&2; exit 1 ;;
    *) break ;;
  esac
done

if [ "$MODE" = "prod" ]; then
  COMPOSE_FILE="infra/docker-compose.prod.yml"
  ENV_FILE=".env.prod"
else
  COMPOSE_FILE="infra/docker-compose.yml"
  ENV_FILE=".env"
fi
COMPOSE="docker compose -f $COMPOSE_FILE --env-file $ENV_FILE"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}[royd]${NC} $*"; }
ok()   { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*" >&2; }

if [ ! -f "$ENV_FILE" ]; then
  err "$ENV_FILE topilmadi. Avval ./deploy.sh init ni ishga tushiring."
  exit 1
fi

if ! $COMPOSE ps --status running 2>/dev/null | grep -q backend; then
  err "Backend ishlamayapti. Avval: ./deploy.sh${MODE:+ --$MODE} up"
  exit 1
fi

# ── Mavjud xodimlar ro'yxati ────────────────────────────────────────────────
if [ "$LIST_ONLY" = "1" ]; then
  log "Mavjud xodimlar:"
  $COMPOSE exec -T backend sh -c 'PYTHONPATH=/app /opt/venv/bin/python -c "
import asyncio
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.db import SessionLocal
from app.models import Employee, Role, User

async def main():
    async with SessionLocal() as db:
        rows = (await db.execute(
            select(User).join(Role, Role.id == User.role_id)
            .where(Role.name != \"student\")
            .options(selectinload(User.role))
            .order_by(User.id)
        )).scalars().all()
        if not rows:
            print(\"  (boʼsh)\")
            return
        for u in rows:
            faol = \"faol\" if u.is_active else \"NOFAOL\"
            print(f\"  {u.id:>3}  {u.role.name:<12} {faol:<7} {u.email or chr(45)}  {u.full_name}\")

asyncio.run(main())
"'
  exit 0
fi

# ── Argumentlar / so'rov ────────────────────────────────────────────────────
EMAIL="${1:-}"
PASSWORD="${2:-}"
NAME="${3:-}"

if [ -z "$EMAIL" ]; then
  read -r -p "Email: " EMAIL
fi
if [ -z "$EMAIL" ]; then
  err "Email kiritilmadi."
  exit 1
fi
case "$EMAIL" in
  *@*.*) ;;
  *) err "Email noto'g'ri ko'rinishda: $EMAIL"; exit 1 ;;
esac

if [ -z "$PASSWORD" ]; then
  # Yashirin kiritish — parol terminal tarixida qolmaydi.
  read -r -s -p "Parol: " PASSWORD; echo
  read -r -s -p "Parolni takrorlang: " PASSWORD2; echo
  if [ "$PASSWORD" != "$PASSWORD2" ]; then
    err "Parollar mos kelmadi."
    exit 1
  fi
fi

if [ ${#PASSWORD} -lt 12 ]; then
  err "Parol juda qisqa (${#PASSWORD} belgi). Kamida 12 belgi bo'lsin."
  echo "    Tavsiya: openssl rand -base64 18" >&2
  exit 1
fi

# Ma'lum, ochiq parollarni to'sish — README'da e'lon qilinganlari server uchun
# yaroqsiz.
case "$PASSWORD" in
  admin123|reg123|staff123|lead123|student1|password|12345678*)
    err "Bu parol ochiq manbada e'lon qilingan. Boshqasini tanlang."
    exit 1 ;;
esac

if [ -z "$NAME" ]; then
  read -r -p "F.I.Sh [Administrator]: " NAME
  NAME="${NAME:-Administrator}"
fi

log "Stack: $MODE | rol: $ROLE | email: $EMAIL"

# ── Yaratish / yangilash ────────────────────────────────────────────────────
# Qiymatlar faqat environment orqali: shell ham, python ham ularni matn
# sifatida ko'rmaydi, shuning uchun har qanday belgi xavfsiz.
$COMPOSE exec -T \
  -e ROYD_ADMIN_EMAIL="$EMAIL" \
  -e ROYD_ADMIN_PASSWORD="$PASSWORD" \
  -e ROYD_ADMIN_NAME="$NAME" \
  -e ROYD_ADMIN_ROLE="$ROLE" \
  backend sh -c 'PYTHONPATH=/app /opt/venv/bin/python -c "
import asyncio, os, sys
from sqlalchemy import select
from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models import Employee, Role, User

async def main():
    email = os.environ[\"ROYD_ADMIN_EMAIL\"]
    password = os.environ[\"ROYD_ADMIN_PASSWORD\"]
    name = os.environ[\"ROYD_ADMIN_NAME\"]
    role_name = os.environ[\"ROYD_ADMIN_ROLE\"]

    async with SessionLocal() as db:
        role = (await db.execute(
            select(Role).where(Role.name == role_name))).scalar_one_or_none()
        if role is None:
            print(f\"XATO: \x27{role_name}\x27 roli topilmadi\", file=sys.stderr)
            raise SystemExit(1)
        if role_name == \"student\":
            print(\"XATO: talaba hisobi HEMIS orqali yaratiladi\", file=sys.stderr)
            raise SystemExit(1)

        existing = (await db.execute(
            select(User).where(User.email == email))).scalar_one_or_none()
        if existing:
            existing.password_hash = hash_password(password)
            existing.role_id = role.id
            existing.is_active = True
            existing.full_name = name
            user = existing
            action = \"YANGILANDI\"
        else:
            user = User(full_name=name, email=email,
                        password_hash=hash_password(password),
                        role_id=role.id, is_active=True)
            db.add(user)
            action = \"YARATILDI\"
        await db.flush()

        # Xodim profili 0005 migratsiyasidan beri alohida jadvalda; bu qatorsiz
        # hisob mavjud boʼladi-yu, xodim yozuvi boʼlmaydi.
        profile = (await db.execute(
            select(Employee).where(Employee.user_id == user.id))).scalar_one_or_none()
        if profile is None:
            db.add(Employee(user_id=user.id))
        await db.commit()
        print(f\"{action}: {email} (id={user.id}, rol={role_name})\")

        # Fakultetsiz registrator hech qanday murojaat olmaydi, chunki
        # yoʼnaltirish aynan shu bogʼlanish orqali ishlaydi.
        if role_name == \"registrator\" and profile is not None and profile.faculty_id is None:
            print(\"OGOHLANTIRISH: bu registratorga fakultet biriktirilmagan — \"
                  \"Admin → Xodimlar boʼlimidan biriktiring, aks holda unga \"
                  \"murojaat tushmaydi.\")
        elif role_name == \"registrator\" and profile is None:
            print(\"OGOHLANTIRISH: bu registratorga fakultet biriktirilmagan — \"
                  \"Admin → Xodimlar boʼlimidan biriktiring, aks holda unga \"
                  \"murojaat tushmaydi.\")

asyncio.run(main())
"'

ok "Tayyor. Endi shu email va parol bilan kirishingiz mumkin."
warn "Parolni parol menejerida saqlang — u boshqa hech qayerda saqlanmaydi."
