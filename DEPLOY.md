# ROYD — O'rnatish va Deploy Yo'riqnomasi

ROYD (Registrator Ofis – Yagona Darcha Tizimi) platformasini serverga yoki lokal muhitga o'rnatish bo'yicha to'liq qo'llanma.

---

## 📋 Shartlar (Prerequisites)

Faqat bitta narsa kerak:

```bash
git --version    # kodni olish uchun (ixtiyoriy)
```

Docker va Nginx — `deploy.sh` skripti avtomatik o'rnatadi.

---

## 🐳 Docker O'rnatish (Avtomatik)

### Bitta buyruq bilan

```bash
./deploy.sh install-docker
```

Bu buyruq quyidagilarni bajaradi:
- ✅ Docker CE o'rnatadi
- ✅ Docker Compose plugin o'rnatadi
- ✅ Foydalanuvchini `docker` guruhiga qo'shadi
- ✅ Docker servisini avtomatik ishga tushirish uchun yoqadi

O'rnatishdan keyin terminalni **qayta oching** yoki:

```bash
newgrp docker
docker run hello-world   # tekshirish
```

### Qo'lda o'rnatish (ixtiyoriy)

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
```

---

## 🚀 Birinchi O'rnatish (Fresh Install)

### 1-qadam: Kodni olish

```bash
git clone <your-repo-url> royd
cd royd
```

### 2-qadam: Bitta buyruq bilan hamma narsani ishga tushirish

```bash
./deploy.sh init
```

Bu buyruq quyidagilarni avtomatik bajaradi:

- ✅ `.env` fayli yaratadi (kuchli JWT_SECRET avtomatik generatsiya)
- ✅ `infra/.env` symlink qo'yadi
- ✅ Docker image'larni build qiladi (~3–5 daqiqa, birinchi marta)
- ✅ 5 ta servisni ishga tushiradi: `postgres`, `redis`, `mailhog`, `backend`, `frontend`
- ✅ Alembic migratsiyalarni qo'llaydi
- ✅ Boshlang'ich ma'lumotlarni (roles, faculties, categories, seed users) qo'shadi

### 3-qadam: Holatni tekshirish

```bash
./deploy.sh status
```

Natija:

```
🌐 Frontend:    http://localhost:5174
🔌 Backend API: http://localhost:8001/api/docs
📧 MailHog UI:  http://localhost:8025
```

### 4-qadam: Shaxsiy admin yaratish

```bash
./deploy.sh admin "sizning@email.uz" "StrongPassword123" "Ism Familiya"
```

Keyin [http://localhost:5174](http://localhost:5174) ga kirib **"Xodim kirishi"** tabini tanlang va yaratgan email/parol bilan kiring.

---

## 📚 Seed Foydalanuvchilar (Dev)

Birinchi o'rnatishdan so'ng quyidagi test foydalanuvchilari avtomatik yaratiladi:

| Email | Parol | Rol |
|---|---|---|
| `admin@royd.uz` | `admin123` | Admin |
| `registrator@royd.uz` | `reg123` | Registrator |
| `leadership@royd.uz` | `lead123` | Leadership |
| `staff1@royd.uz` | `staff123` | Staff (IT/DI) |
| `staff2@royd.uz` | `staff123` | Staff (IT/KI) |
| `staff3@royd.uz` | `staff123` | Staff (EC/BI) |

Talaba kirishi uchun — **haqiqiy HEMIS** ID va paroli (student.ndki.uz) ishlatiladi. Fakultet va guruh birinchi login vaqtida avtomatik yaratiladi.

---

## 🔧 Kundalik Buyruqlar

| Buyruq | Tavsif |
|---|---|
| `./deploy.sh up` | Kontaynerlarni yoqish |
| `./deploy.sh down` | To'xtatish |
| `./deploy.sh restart` | Qayta ishga tushirish |
| `./deploy.sh status` | Holat + URL'lar + IP manzillar |
| `./deploy.sh ips` | Server IP manzillarini ko'rish |
| `./deploy.sh logs` | Barcha log'lar (Ctrl+C bilan chiqish) |
| `./deploy.sh logs backend` | Faqat bitta servis log'i |
| `./deploy.sh migrate` | Alembic migratsiyalarni qo'llash |
| `./deploy.sh seed` | Seed ma'lumotlarni qayta qo'shish |

---

## 🔄 Yangilash (Update)

Kod o'zgarganda (git pull, yangi migratsiya, yangi dependency):

```bash
./deploy.sh update
```

Bu quyidagilarni ketma-ket bajaradi:

1. `git pull` (agar git repo bo'lsa)
2. `backend` va `frontend` image'larini qayta build qiladi
3. Faqat `backend` + `frontend`ni qayta ishga tushiradi (DB **saqlanadi**)
4. Migratsiyalarni qo'llaydi

---

## 🐞 Muammolarni Hal Qilish

### Port band

`.env` faylida portlarni o'zgartiring:

```env
POSTGRES_PORT=5434
REDIS_PORT=6381
BACKEND_PORT=8002
FRONTEND_PORT=5175
```

So'ng:

```bash
./deploy.sh down
./deploy.sh up
```

### Backend xatolik beryapti

```bash
./deploy.sh logs backend
```

Ko'p uchraydigan sabablar:
- **DB ulanmaydi** → `./deploy.sh logs postgres` va `./deploy.sh migrate`
- **HEMIS 401** → `.env`da `HEMIS_USE_MOCK=true` bo'lsa, test ID'lar (`STU001/student1`) bilan kiring; haqiqiy HEMIS uchun `false` qo'ying

### Migratsiya xato berdi

```bash
./deploy.sh logs backend | grep alembic
./deploy.sh migrate
```

### Hammasini nolga tushirish (DB bilan)

⚠️ **DIQQAT:** barcha ma'lumotlar o'chadi.

```bash
./deploy.sh clean
./deploy.sh init
```

---

## 🌐 Nginx O'rnatish (Server uchun)

Serverda platformaga tashqi IP orqali kirish imkonini berish uchun Nginx o'rnating.

### Avtomatik o'rnatish

```bash
./deploy.sh setup-nginx
```

Bu buyruq:
- ✅ Nginx o'rnatadi (agar yo'q bo'lsa)
- ✅ Server IP manzilini **avtomatik** aniqlaydi (lokal + tashqi)
- ✅ Nginx konfiguratsiyasini yozadi (frontend + API + WebSocket proxy)
- ✅ Nginx servisini ishga tushiradi

### Domen bilan ishlatish

```bash
./deploy.sh setup-nginx royd.ndki.uz
```

### O'rnatishdan keyin

```bash
./deploy.sh ips   # qaysi IP/domen orqali kirish mumkinligini ko'rish
```

Natija:
```
  Lokal IP(lar): 192.168.1.100
  Tashqi IP:     85.121.45.67

  Platforma manzillari:
  🌐 http://192.168.1.100  (Nginx orqali)
  🌍 http://85.121.45.67   (tashqi IP, Nginx orqali)
```

### HTTPS (TLS) qo'shish

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d royd.ndki.uz
```

---

## 🔒 Production Deploy

Real serverga chiqarish uchun quyidagilarni o'zgartiring:

### 1. `.env` xavfsizlik sozlamalari

```env
# Kuchli parol
POSTGRES_PASSWORD=<32+ belgili random>

# Kuchli JWT secret (init o'zi generatsiya qiladi)
JWT_SECRET=<64 belgi hex>

# Haqiqiy HEMIS
HEMIS_USE_MOCK=false
HEMIS_BASE_URL=https://student.ndki.uz

# Haqiqiy SMTP (MailHog o'rniga)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USERNAME=apikey
SMTP_PASSWORD=<sendgrid_api_key>
SMTP_TLS=true
SMTP_FROM=noreply@ndki.uz
```

### 2. `docker-compose.yml` dev-only qismlarini olib tashlash

Production uchun `docker-compose.prod.yml` (hozircha tayyorlanmagan) bo'lishi kerak:

- Backend `--reload` flagini olib tashlash → `uvicorn` multi-worker rejimida (gunicorn)
- Bind mount `../backend:/app` → olib tashlash (image ichidagi kod)
- MailHog servisini olib tashlash
- `restart: unless-stopped` qo'shish

### 3. Nginx reverse proxy + TLS

Serverda domenni sozlab, Let's Encrypt sertifikatini olish:

```bash
sudo apt install nginx certbot python3-certbot-nginx
sudo certbot --nginx -d royd.ndki.uz
```

Nginx config misoli (`/etc/nginx/sites-available/royd`):

```nginx
server {
    listen 443 ssl http2;
    server_name royd.ndki.uz;

    ssl_certificate     /etc/letsencrypt/live/royd.ndki.uz/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/royd.ndki.uz/privkey.pem;

    # Frontend
    location / {
        proxy_pass http://localhost:5174;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket
    location /ws/ {
        proxy_pass http://localhost:8001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}

server {
    listen 80;
    server_name royd.ndki.uz;
    return 301 https://$server_name$request_uri;
}
```

### 4. PostgreSQL backup (kundalik)

`/etc/cron.daily/royd-backup`:

```bash
#!/bin/bash
BACKUP_DIR=/var/backups/royd
mkdir -p $BACKUP_DIR
docker compose -f /opt/royd/infra/docker-compose.yml --env-file /opt/royd/.env \
    exec -T postgres pg_dump -U royd royd \
    | gzip > $BACKUP_DIR/royd-$(date +%Y%m%d).sql.gz
# 30 kundan eski backup'larni o'chirish
find $BACKUP_DIR -name "royd-*.sql.gz" -mtime +30 -delete
```

---

## 🆘 Eng Qisqa Boshlash

### Lokal (dev)

```bash
./deploy.sh init                                              # o'rnatish
./deploy.sh admin admin@royd.uz "Admin2000!" "Super Admin"   # admin qo'shish
./deploy.sh status                                            # URL'larni ko'rish
```

Brauzerda [http://localhost:5174](http://localhost:5174) ga kirib ishlab ko'ring.

### Server (prod)

```bash
./deploy.sh install-docker    # Docker o'rnatish (bir marta)
newgrp docker                  # yoki terminalni qayta oching
./deploy.sh init               # platformani o'rnatish
./deploy.sh setup-nginx        # Nginx + IP avtomatik sozlash
./deploy.sh admin admin@royd.uz "StrongPass123!" "Super Admin"
./deploy.sh ips                # qaysi URL orqali kirish mumkin
```

---

## 📞 Yordam

Muammo bo'lsa:

1. `./deploy.sh logs` bilan log'larni ko'ring
2. `./deploy.sh status` bilan servislar faolligini tekshiring
3. `.env` dagi portlar boshqa jarayonlar bilan to'qnashmaganini tekshiring: `sudo lsof -i :8001`
