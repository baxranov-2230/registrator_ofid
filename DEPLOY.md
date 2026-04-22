# ROYD — Server Deploy Yo'riqnomasi

---

## Arxitektura

```
Internet → Server IP:80 (yoki 8080)
                │
            [nginx]  ← docker container
           /       \
    [frontend]   [backend]  ← docker containers
     port 5173    port 8000
                     │
              [postgres] [redis]  ← docker containers
```

Nginx hamma narsaning old tomonida turadi — barcha so'rovlar undan o'tadi.

---

## 1. Server tayyorlash (bir marta)

### Docker o'rnatish

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
```

Tekshirish:
```bash
docker run hello-world
docker compose version
```

### Kodni olish

```bash
git clone <repo-url> royd
cd royd
```

---

## 2. Portni sozlash

Port **80** bo'sh bo'lsa — hech narsa qilmang, default ishlaydi.

Port 80 da boshqa narsa (Apache, nginx host) ishlayotgan bo'lsa:

```bash
# Yoki host nginx ni to'xtatish:
sudo systemctl stop nginx
sudo systemctl disable nginx
```

Yoki `.env` da portni o'zgartirish:
```env
NGINX_PORT=8080
```

---

## 3. O'rnatish

```bash
./deploy.sh init
```

Bu buyruq:
- `.env` fayl yaratadi (JWT_SECRET avtomatik generatsiya)
- Docker image'larni build qiladi (3–5 daqiqa)
- 6 ta konteyner ishga tushiradi: `postgres`, `redis`, `mailhog`, `backend`, `frontend`, `nginx`
- Migratsiyalarni qo'llaydi
- Seed ma'lumotlarni qo'shadi

---

## 4. Admin yaratish

```bash
./deploy.sh admin "admin@ndki.uz" "KuchliParol123!" "Ism Familiya"
```

---

## 5. Tekshirish

```bash
./deploy.sh status
```

Natija:
```
🌐 Platforma:   http://localhost:8080
🔌 Backend API: http://localhost:8001/api/docs
📧 MailHog UI:  http://localhost:8025

  Tarmoqdan kirish (nginx port 8080):
  🌐 http://192.168.1.100:8080
  🌍 http://85.121.45.67:8080  (tashqi)
```

Brauzerda `http://server-ip:8080` ga kirib tekshiring.

---

## Konteynerlar holati

| Servis    | Port (host) | Maqsad                     |
|-----------|-------------|----------------------------|
| nginx     | 80 (8080)   | Asosiy kirish nuqtasi       |
| frontend  | 5174        | React UI (Vite dev server)  |
| backend   | 8001        | FastAPI                     |
| postgres  | 5433        | Ma'lumotlar bazasi          |
| redis     | 6380        | Cache / session             |
| mailhog   | 8025        | Email UI (dev)              |

---

## Kundalik buyruqlar

```bash
./deploy.sh up          # ishga tushirish
./deploy.sh down        # to'xtatish
./deploy.sh restart     # qayta ishga tushirish
./deploy.sh status      # holat + URL'lar
./deploy.sh logs        # barcha loglar
./deploy.sh logs nginx  # faqat nginx log
./deploy.sh logs backend
./deploy.sh update      # git pull + rebuild + migrate
```

---

## Yangilash (kod o'zgarganda)

```bash
git pull
./deploy.sh update
```

---

## Port band bo'lsa

```bash
# Qaysi port band ekanini ko'rish:
ss -tlnp | grep ':80 '

# .env da portni o'zgartirish:
nano .env
# NGINX_PORT=8080

./deploy.sh down
./deploy.sh up
```

---

## Seed foydalanuvchilar (test)

| Email                  | Parol     | Rol          |
|------------------------|-----------|--------------|
| `admin@royd.uz`        | `admin123`  | Admin        |
| `registrator@royd.uz`  | `reg123`    | Registrator  |
| `leadership@royd.uz`   | `lead123`   | Rahbariyat   |
| `staff1@royd.uz`       | `staff123`  | Xodim        |

Talaba kirishi — haqiqiy HEMIS ID va parol (`student.ndki.uz`).

---

## Muammolar

### Nginx ishlamayapti
```bash
./deploy.sh logs nginx
```
Agar `host not found in upstream` — kodni yangilang va qayta ishga tushiring:
```bash
git pull
./deploy.sh down && ./deploy.sh up
```

### Port band
```bash
sudo systemctl stop nginx   # host nginx ni to'xtatish
# yoki .env da NGINX_PORT=8080
```

### Backend xato
```bash
./deploy.sh logs backend
./deploy.sh migrate
```

### Hammasini noldan boshlash
```bash
./deploy.sh clean
./deploy.sh init
```

---

## Domenni bog'lash

### 1. DNS sozlash

Domen sotib olgan joyda (beget, reg.ru, namecheap va h.k.) DNS sozlamalariga kirib **A record** qo'shing:

| Turi | Nomi | Qiymati          |
|------|------|------------------|
| A    | @    | serverning IP si |
| A    | www  | serverning IP si |

Server IP ni bilish: `./deploy.sh ips`

DNS tarqalishi 5 daqiqadan 24 soatgacha. Tekshirish:
```bash
ping royd.ndki.uz
```

### 2. .env ga domen qo'shish

```env
NGINX_HOST=royd.ndki.uz
NGINX_PORT=80
```

### 3. Qayta ishga tushirish

```bash
./deploy.sh down
./deploy.sh up
```

Endi `http://royd.ndki.uz` dan platforma ochiladi.

### 4. HTTPS (SSL sertifikat) — ixtiyoriy

Domenni serverga bog'laganingizdan keyin bepul SSL qo'shish:

```bash
# Certbot o'rnatish
sudo apt install -y certbot

# Sertifikat olish (port 80 vaqtincha bo'shatiladi)
./deploy.sh down
sudo certbot certonly --standalone -d royd.ndki.uz -d www.royd.ndki.uz
./deploy.sh up
```

SSL sertifikat olganingizdan keyin `infra/nginx.conf` ga HTTPS blok qo'shing yoki Let's Encrypt avtomatik yangilanishi uchun cron qo'shing:

```bash
# Har 90 kunda avtomatik yangilanish
echo "0 3 * * * root certbot renew --quiet --pre-hook 'docker compose -f /opt/royd/infra/docker-compose.yml down' --post-hook 'docker compose -f /opt/royd/infra/docker-compose.yml up -d'" | sudo tee /etc/cron.d/certbot-royd
```

---

## Production uchun qo'shimcha

### HEMIS (haqiqiy)
`.env` da:
```env
HEMIS_USE_MOCK=false
HEMIS_BASE_URL=https://student.ndki.uz
```

### Kuchli parollar
```env
POSTGRES_PASSWORD=<32+ belgili random parol>
JWT_SECRET=<64 belgili hex>
```

### HTTPS (domen bo'lsa)
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d royd.ndki.uz
```

### Kundalik backup
```bash
# /etc/cron.daily/royd-backup fayliga:
#!/bin/bash
docker compose -f /opt/royd/infra/docker-compose.yml --env-file /opt/royd/.env \
  exec -T postgres pg_dump -U royd royd \
  | gzip > /var/backups/royd-$(date +%Y%m%d).sql.gz
find /var/backups -name "royd-*.sql.gz" -mtime +30 -delete
```
