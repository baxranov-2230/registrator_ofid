#!/usr/bin/env bash
# ROYD platformasi — deploy skripti
# Foydalanish: ./deploy.sh [init|up|down|restart|update|migrate|seed|logs|status|clean]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

COMPOSE="docker compose -f infra/docker-compose.yml --env-file .env"

# Ranglar
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}[royd]${NC} $*"; }
ok()   { echo -e "${GREEN}[✓]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*" >&2; }

require() {
  command -v "$1" >/dev/null 2>&1 || { err "$1 o'rnatilmagan"; exit 1; }
}

check_prereqs() {
  require docker
  if ! docker compose version >/dev/null 2>&1; then
    err "docker compose plugin o'rnatilmagan"
    exit 1
  fi
  if ! docker info >/dev/null 2>&1; then
    err "Docker demon ishlamayapti. 'sudo systemctl start docker' bilan ishga tushiring"
    exit 1
  fi
}

generate_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 48
  fi
}

cmd_init() {
  log "Birinchi o'rnatish boshlandi..."
  check_prereqs

  if [ ! -f .env ]; then
    log ".env fayli yaratilmoqda..."
    if [ -f .env.example ]; then
      cp .env.example .env
    else
      cat > .env <<EOF
POSTGRES_USER=royd
POSTGRES_PASSWORD=royd_dev_pw
POSTGRES_DB=royd
POSTGRES_PORT=5433

REDIS_PORT=6380

BACKEND_PORT=8001
JWT_SECRET=$(generate_secret)

FRONTEND_PORT=5174

MAILHOG_SMTP_PORT=1025
MAILHOG_UI_PORT=8025
EOF
    fi

    # JWT_SECRET ni kuchli qiymatga almashtiradi
    if grep -q "change-me" .env 2>/dev/null; then
      NEW_SECRET=$(generate_secret)
      sed -i.bak "s|JWT_SECRET=.*|JWT_SECRET=$NEW_SECRET|" .env
      rm -f .env.bak
      ok "JWT_SECRET avtomatik generatsiya qilindi"
    fi
    ok ".env yaratildi"
  else
    warn ".env allaqachon mavjud — saqlanib qoldi"
  fi

  # infra/.env symlink
  if [ ! -e infra/.env ]; then
    (cd infra && ln -sf ../.env .env)
    ok "infra/.env symlink yaratildi"
  fi

  log "Docker image'lar yaratilmoqda (birinchi martasi 3-5 daqiqa)..."
  $COMPOSE build

  log "Kontaynerlar ishga tushirilmoqda..."
  $COMPOSE up -d

  log "Servislar tayyor bo'lishi kutilmoqda..."
  sleep 20

  cmd_migrate
  cmd_seed

  ok "O'rnatish tugadi!"
  cmd_status
}

cmd_up() {
  check_prereqs
  log "Kontaynerlar ishga tushirilmoqda..."
  $COMPOSE up -d
  ok "Ishga tushirildi"
  cmd_status
}

cmd_down() {
  log "Kontaynerlar to'xtatilmoqda..."
  $COMPOSE down
  ok "To'xtatildi"
}

cmd_restart() {
  log "Qayta ishga tushirish..."
  $COMPOSE restart
  ok "Qayta ishga tushirildi"
}

cmd_update() {
  check_prereqs
  log "Kodni yangilash (git pull)..."
  if [ -d .git ]; then
    git pull --ff-only || warn "git pull muvaffaqiyatsiz — lokal o'zgarishlarni tekshiring"
  else
    warn "git repository emas — git pull o'tkazib yuborildi"
  fi

  log "Image'lar qayta yaratilmoqda..."
  $COMPOSE build backend frontend

  log "Backend va frontend qayta ishga tushirilmoqda..."
  $COMPOSE up -d backend frontend

  sleep 15
  cmd_migrate
  ok "Yangilandi"
  cmd_status
}

cmd_migrate() {
  log "Migratsiyalar qo'llanilmoqda..."
  $COMPOSE exec -T backend .venv/bin/alembic upgrade head
  ok "Migratsiyalar bajarildi"
}

cmd_seed() {
  log "Boshlang'ich ma'lumotlar qo'shilmoqda..."
  $COMPOSE exec -T backend .venv/bin/python -m app.seed
  ok "Seed tugadi"
}

cmd_logs() {
  $COMPOSE logs -f --tail=100 "${@:-}"
}

cmd_status() {
  log "Servislar holati:"
  $COMPOSE ps
  echo ""

  # .env dan portlarni o'qiydi
  if [ -f .env ]; then
    # shellcheck disable=SC1091
    set -a; . ./.env; set +a
  fi

  FP=${FRONTEND_PORT:-5174}
  BP=${BACKEND_PORT:-8001}
  MP=${MAILHOG_UI_PORT:-8025}

  echo "🌐 Frontend:    http://localhost:${FP}"
  echo "🔌 Backend API: http://localhost:${BP}/api/docs"
  echo "📧 MailHog UI:  http://localhost:${MP}"
}

cmd_clean() {
  warn "Barcha DB va volume'lar o'chiriladi!"
  read -p "Davom etasizmi? (y/N): " CONFIRM
  if [ "$CONFIRM" = "y" ] || [ "$CONFIRM" = "Y" ]; then
    $COMPOSE down -v
    ok "Tozalandi"
  else
    log "Bekor qilindi"
  fi
}

cmd_admin() {
  if [ -z "$2" ] || [ -z "$3" ]; then
    err "Foydalanish: ./deploy.sh admin <email> <parol> [F.I.Sh]"
    exit 1
  fi
  EMAIL="$2"; PASSWORD="$3"; NAME="${4:-Administrator}"

  log "Admin yaratilmoqda: $EMAIL"
  $COMPOSE exec -T backend sh -c "PYTHONPATH=/app .venv/bin/python -c \"
import asyncio
from sqlalchemy import select
from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models import Role, User

async def main():
    async with SessionLocal() as db:
        admin_role = (await db.execute(select(Role).where(Role.name == 'admin'))).scalar_one()
        email = '$EMAIL'
        existing = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if existing:
            existing.password_hash = hash_password('$PASSWORD')
            existing.role_id = admin_role.id
            existing.is_active = True
            existing.full_name = '$NAME'
            print('YANGILANDI:', email)
        else:
            db.add(User(full_name='$NAME', email=email,
                        password_hash=hash_password('$PASSWORD'),
                        role_id=admin_role.id, is_active=True))
            print('YARATILDI:', email)
        await db.commit()

asyncio.run(main())
\""
  ok "Admin tayyor: $EMAIL"
}

usage() {
  cat <<EOF
ROYD Deploy Script

Foydalanish: ./deploy.sh <command>

Asosiy:
  init              Birinchi o'rnatish (.env, build, up, migrate, seed)
  up                Kontaynerlarni ishga tushirish
  down              Kontaynerlarni to'xtatish
  restart           Qayta ishga tushirish
  update            Git pull + rebuild + migrate (yangilanish)
  status            Ishlab turgan servislar va URL'lar

Boshqaruv:
  migrate           Alembic migratsiyalarni qo'llash
  seed              Boshlang'ich ma'lumotlarni qo'shish
  logs [servis]     Log'larni kuzatish (backend/frontend/postgres/...)
  admin <email> <parol> [ism]
                    Admin foydalanuvchi yaratish/yangilash

Xavfli:
  clean             Hamma narsani o'chirish (DB, volume'lar)

Misollar:
  ./deploy.sh init
  ./deploy.sh admin admin@royd.uz "StrongPass123" "Sardor Admin"
  ./deploy.sh logs backend
  ./deploy.sh update
EOF
}

case "${1:-help}" in
  init)     cmd_init ;;
  up)       cmd_up ;;
  down)     cmd_down ;;
  restart)  cmd_restart ;;
  update)   cmd_update ;;
  migrate)  cmd_migrate ;;
  seed)     cmd_seed ;;
  logs)     shift; cmd_logs "$@" ;;
  status|ps) cmd_status ;;
  clean)    cmd_clean ;;
  admin)    cmd_admin "$@" ;;
  help|--help|-h|"") usage ;;
  *)        err "Noma'lum buyruq: $1"; usage; exit 1 ;;
esac
