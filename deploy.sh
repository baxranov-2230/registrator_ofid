#!/usr/bin/env bash
# ROYD platformasi — deploy skripti
# Foydalanish: ./deploy.sh [init|up|down|restart|update|migrate|seed|logs|status|clean|install-docker|setup-nginx]

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
    err "docker compose plugin o'rnatilmagan. './deploy.sh install-docker' bilan o'rnating"
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

# ─────────────────────────────────────────────
# Docker va Docker Compose o'rnatish
# ─────────────────────────────────────────────
cmd_install_docker() {
  log "Docker o'rnatish tekshirilmoqda..."

  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    ok "Docker allaqachon o'rnatilgan: $(docker --version)"
    ok "Docker Compose: $(docker compose version)"
    return 0
  fi

  # Faqat Ubuntu/Debian uchun
  if ! command -v apt-get >/dev/null 2>&1; then
    err "Bu buyruq faqat Ubuntu/Debian tizimlarida ishlaydi"
    err "Boshqa tizimlar uchun: https://docs.docker.com/engine/install/"
    exit 1
  fi

  log "Docker o'rnatilmoqda (Ubuntu/Debian)..."
  sudo apt-get update -qq
  sudo apt-get install -y -qq ca-certificates curl gnupg lsb-release

  # Docker GPG kaliti
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg

  # Docker repo
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

  sudo apt-get update -qq
  sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin

  # Foydalanuvchini docker guruhiga qo'shish
  sudo usermod -aG docker "$USER"

  # Docker servisini yoqish
  sudo systemctl enable docker
  sudo systemctl start docker

  ok "Docker o'rnatildi: $(docker --version)"
  ok "Docker Compose: $(docker compose version)"
  warn "Muhim: yangi guruh (docker) kuchga kirishi uchun terminalni qayta oching yoki:"
  warn "  newgrp docker"
  warn "So'ng: ./deploy.sh init"
}

# ─────────────────────────────────────────────
# Server IP manzillarini aniqlash
# ─────────────────────────────────────────────
get_server_ips() {
  LOCAL_IPS=""
  PUBLIC_IP=""

  # Lokal IP manzillar (barcha interfacelar)
  if command -v ip >/dev/null 2>&1; then
    LOCAL_IPS=$(ip -4 addr show scope global | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | tr '\n' ' ')
  elif command -v ifconfig >/dev/null 2>&1; then
    LOCAL_IPS=$(ifconfig | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | grep -v '127\.' | tr '\n' ' ')
  fi

  # Tashqi (public) IP
  for svc in "https://api.ipify.org" "https://ifconfig.me" "https://icanhazip.com"; do
    PUBLIC_IP=$(curl -s --connect-timeout 3 "$svc" 2>/dev/null | tr -d '[:space:]') || true
    if [[ "$PUBLIC_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      break
    fi
    PUBLIC_IP=""
  done
}

# ─────────────────────────────────────────────
# Nginx o'rnatish va sozlash
# ─────────────────────────────────────────────
cmd_setup_nginx() {
  log "Nginx o'rnatish va sozlash boshlandi..."

  if ! command -v apt-get >/dev/null 2>&1; then
    err "Bu buyruq faqat Ubuntu/Debian tizimlarida ishlaydi"
    exit 1
  fi

  # .env dan portlarni o'qish
  if [ -f .env ]; then
    set -a; . ./.env; set +a
  fi

  FP=${FRONTEND_PORT:-5174}
  BP=${BACKEND_PORT:-8001}

  # Nginx o'rnatish
  if ! command -v nginx >/dev/null 2>&1; then
    log "Nginx o'rnatilmoqda..."
    sudo apt-get update -qq
    sudo apt-get install -y -qq nginx
    ok "Nginx o'rnatildi"
  else
    ok "Nginx allaqachon o'rnatilgan: $(nginx -v 2>&1)"
  fi

  # IP manzillarni aniqlash
  log "Server IP manzillari aniqlanmoqda..."
  get_server_ips

  echo ""
  echo "  Lokal IP(lar): ${LOCAL_IPS:-topilmadi}"
  echo "  Tashqi IP:     ${PUBLIC_IP:-topilmadi}"
  echo ""

  # Domen yoki IP tanlash
  if [ -n "$2" ]; then
    SERVER_NAME="$2"
    log "Domen/IP: $SERVER_NAME (argument orqali)"
  elif [ -n "$PUBLIC_IP" ]; then
    SERVER_NAME="$PUBLIC_IP"
    log "Tashqi IP ishlatiladi: $SERVER_NAME"
  elif [ -n "$LOCAL_IPS" ]; then
    # Birinchi lokal IP ni olish
    SERVER_NAME=$(echo "$LOCAL_IPS" | awk '{print $1}')
    log "Lokal IP ishlatiladi: $SERVER_NAME"
  else
    SERVER_NAME="localhost"
    warn "IP topilmadi, 'localhost' ishlatiladi"
  fi

  # Nginx config yozish
  NGINX_CONF="/etc/nginx/sites-available/royd"
  log "Nginx konfiguratsiyasi yozilmoqda: $NGINX_CONF"

  sudo tee "$NGINX_CONF" > /dev/null <<NGINXEOF
# ROYD — Registrator Ofis platformasi
# Avtomatik yaratilgan: $(date)
# Server: $SERVER_NAME

server {
    listen 80;
    server_name $SERVER_NAME;

    # Fayl yuklash limiti
    client_max_body_size 50M;

    # Frontend (React SPA)
    location / {
        proxy_pass http://127.0.0.1:${FP};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }

    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:${BP};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120s;
    }

    # WebSocket
    location /ws/ {
        proxy_pass http://127.0.0.1:${BP};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 3600s;
    }

    # Static fayllar keshi
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://127.0.0.1:${FP};
        proxy_set_header Host \$host;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
NGINXEOF

  ok "Nginx config yozildi: $NGINX_CONF"

  # sites-enabled symlink
  if [ ! -e /etc/nginx/sites-enabled/royd ]; then
    sudo ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/royd
    ok "Symlink yaratildi: /etc/nginx/sites-enabled/royd"
  fi

  # default nginx config ni o'chirish (port 80 konflikt)
  if [ -e /etc/nginx/sites-enabled/default ]; then
    sudo rm -f /etc/nginx/sites-enabled/default
    warn "Default nginx config o'chirildi (port 80 uchun)"
  fi

  # Nginx config tekshirish
  log "Nginx konfiguratsiyasi tekshirilmoqda..."
  if sudo nginx -t; then
    ok "Nginx config to'g'ri"
  else
    err "Nginx config xato! Tekshiring: sudo nginx -t"
    exit 1
  fi

  # Nginx qayta ishga tushirish
  sudo systemctl enable nginx
  sudo systemctl reload nginx
  ok "Nginx qayta ishga tushirildi"

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  ok "Nginx sozlandi!"
  echo ""
  echo "  Platforma manzillari:"
  if [ -n "$LOCAL_IPS" ]; then
    for ip in $LOCAL_IPS; do
      echo "  🌐 http://$ip"
    done
  fi
  [ -n "$PUBLIC_IP" ] && echo "  🌍 http://$PUBLIC_IP  (tashqi)"
  echo "  🌐 http://$SERVER_NAME  (asosiy)"
  echo ""
  echo "  TLS (HTTPS) qo'shish uchun:"
  echo "  sudo apt install certbot python3-certbot-nginx"
  echo "  sudo certbot --nginx -d your-domain.uz"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# ─────────────────────────────────────────────
# Server IP ko'rsatish
# ─────────────────────────────────────────────
cmd_ips() {
  log "Server IP manzillari aniqlanmoqda..."
  get_server_ips

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Lokal IP(lar): ${LOCAL_IPS:-topilmadi}"
  echo "  Tashqi IP:     ${PUBLIC_IP:-topilmadi}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  if [ -f .env ]; then
    set -a; . ./.env; set +a
  fi

  FP=${FRONTEND_PORT:-5174}
  BP=${BACKEND_PORT:-8001}

  echo ""
  echo "  Platforma manzillari:"
  for ip in ${LOCAL_IPS:-localhost}; do
    echo "  🌐 http://$ip (Nginx orqali)"
    echo "     Bevosita: http://$ip:$FP (frontend)"
    echo "     Bevosita: http://$ip:$BP/api/docs (backend)"
  done
  [ -n "$PUBLIC_IP" ] && echo ""
  [ -n "$PUBLIC_IP" ] && echo "  🌍 http://$PUBLIC_IP (tashqi IP, Nginx orqali)"
  echo ""
}

# ─────────────────────────────────────────────
# Asosiy buyruqlar
# ─────────────────────────────────────────────
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

  # IP manzillarni olish (xato bo'lsa silent)
  get_server_ips 2>/dev/null || true

  echo "🌐 Frontend:    http://localhost:${FP}"
  echo "🔌 Backend API: http://localhost:${BP}/api/docs"
  echo "📧 MailHog UI:  http://localhost:${MP}"

  if [ -n "$LOCAL_IPS" ] || [ -n "$PUBLIC_IP" ]; then
    echo ""
    echo "  Tarmoqdan kirish:"
    for ip in ${LOCAL_IPS:-}; do
      echo "  🌐 http://$ip:${FP}"
    done
    [ -n "$PUBLIC_IP" ] && echo "  🌍 http://$PUBLIC_IP:${FP}  (tashqi)"
  fi
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

O'rnatish (bir marta):
  install-docker    Docker va Docker Compose o'rnatish (Ubuntu/Debian)
  setup-nginx [ip]  Nginx o'rnatish va sozlash, IP avtomatik aniqlanadi

Asosiy:
  init              Birinchi o'rnatish (.env, build, up, migrate, seed)
  up                Kontaynerlarni ishga tushirish
  down              Kontaynerlarni to'xtatish
  restart           Qayta ishga tushirish
  update            Git pull + rebuild + migrate (yangilanish)
  status            Ishlab turgan servislar va URL'lar
  ips               Server IP manzillarini ko'rish

Boshqaruv:
  migrate           Alembic migratsiyalarni qo'llash
  seed              Boshlang'ich ma'lumotlarni qo'shish
  logs [servis]     Log'larni kuzatish (backend/frontend/postgres/...)
  admin <email> <parol> [ism]
                    Admin foydalanuvchi yaratish/yangilash

Xavfli:
  clean             Hamma narsani o'chirish (DB, volume'lar)

Misollar:
  ./deploy.sh install-docker
  ./deploy.sh setup-nginx
  ./deploy.sh setup-nginx royd.ndki.uz
  ./deploy.sh init
  ./deploy.sh admin admin@royd.uz "StrongPass123" "Sardor Admin"
  ./deploy.sh ips
  ./deploy.sh logs backend
  ./deploy.sh update
EOF
}

case "${1:-help}" in
  install-docker)  cmd_install_docker ;;
  setup-nginx)     cmd_setup_nginx "$@" ;;
  ips)             cmd_ips ;;
  init)            cmd_init ;;
  up)              cmd_up ;;
  down)            cmd_down ;;
  restart)         cmd_restart ;;
  update)          cmd_update ;;
  migrate)         cmd_migrate ;;
  seed)            cmd_seed ;;
  logs)            shift; cmd_logs "$@" ;;
  status|ps)       cmd_status ;;
  clean)           cmd_clean ;;
  admin)           cmd_admin "$@" ;;
  help|--help|-h|"") usage ;;
  *)               err "Noma'lum buyruq: $1"; usage; exit 1 ;;
esac
