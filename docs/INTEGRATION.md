# ROYD — hamkor platforma bilan integratsiya

Talabalar murojaatni ROYD veb-ilovasida emas, universitetning talabalar
platformasida yuboradi va kuzatadi. Bu hujjat o'sha platforma ROYD API'si bilan
qanday ishlashini tavsiflaydi. To'liq sxema: [`openapi.json`](openapi.json)
(`make openapi` bilan yangilanadi).

Barcha yo'llar `https://<ROYD domeni>/api/v1` ostida. Xatolar FastAPI
formatida keladi: `{"detail": "..."}`, validatsiya xatosi (422) esa
`{"detail": [{"loc": [...], "msg": "..."}]}`.

## 1. Autentifikatsiya

> Talabaning HEMIS tokeni bo'lmagan tashqi tizim o'z nomidan ham ishlay oladi.
> Buning uchun Client ID va Client Secret bilan kiradi, qarang:
> [6-bo'lim](#6-client-id--client-secret-server-to-server).

ROYD talabani HEMIS orqali taniydi. Hamkor platforma talabaning HEMIS tokenini
allaqachon oladi, uni ROYD tokeniga almashtiradi:

```http
POST /api/v1/auth/hemis/exchange
Content-Type: application/json

{"hemis_token": "<talabaning HEMIS tokeni>"}
```

Javob:

```json
{"access_token": "...", "refresh_token": "...", "token_type": "bearer"}
```

- ROYD tokenni HEMIS `/account/me` orqali tekshiradi va talaba profilini
  (fakultet, guruh, kafedra) yangilaydi.
- Keyingi so'rovlar `Authorization: Bearer <access_token>` bilan yuboriladi.
- `access_token` 15 daqiqa amal qiladi. Sessiya 30 daqiqa faolsiz qolsa,
  yopiladi. Ikkala holatda ham 401 qaytadi. Shunda almashtirishni qaytadan
  bajaring yoki `POST /auth/refresh` ga `{"refresh_token": "..."}` yuboring.
- Chaqiruvlarni **hamkor platformaning serveridan** qiling. Brauzerdan
  chaqirilsa, CORS ruxsat bermaydi.

## 2. Murojaat yuborish

Xizmatlar katalogi (ikki bosqichli: xizmat turi → xizmat):

```http
GET /api/v1/categories
```

Murojaat yaratish — **har doim `Idempotency-Key` bilan**:

```http
POST /api/v1/requests
Authorization: Bearer <access_token>
Idempotency-Key: 7f1c2e9a-...        (1–64 belgi, har bir yangi murojaat uchun yangi)
Content-Type: application/json

{
  "category_id": 12,          // aniq xizmat (katalogdagi barg)
  "service_type_id": 1,       // ixtiyoriy; berilsa xizmatga mos bo'lishi shart
  "title": "Ma'lumotnoma kerak",
  "description": "O'qish joyidan ma'lumotnoma"
}
```

| Javob | Ma'nosi |
|---|---|
| `201` | Murojaat yaratildi. |
| `200` | Shu kalit bilan murojaat avval yaratilgan — o'sha qaytarildi. Tarmoq xatosidan keyin qayta yuborish xavfsiz. |
| `409` | Talabaning fakultetiga registrator biriktirilmagan yoki profilda fakultet yo'q. Talabaga matnni ko'rsating. |
| `400` | Xizmat topilmadi, faol emas yoki xizmat turiga mos emas. |

Mas'ul xodim talabaning fakultetidan avtomatik tanlanadi. Ijro muddati
(`sla_deadline`) faqat ish kunlari (dushanba–juma, bayramlarsiz) bo'yicha
hisoblanadi.

## 3. Kuzatish va yozishma

| So'rov | Vazifasi |
|---|---|
| `GET /requests` | Talabaning murojaatlari (`limit`, `offset`, `status`) |
| `GET /requests/{id}` | Tafsilot: holat, tarix, xabarlar, fayllar |
| `POST /requests/{id}/messages` | Talaba xabari: `{"content": "..."}` |
| `POST /requests/{id}/files` | Fayl (`multipart/form-data`, maydon nomi `upload`) |
| `GET /requests/{id}/files/{file_id}` | Faylni yuklab olish (masalan, tayyor hujjat) |
| `POST /requests/{id}/resubmit` | Qaytarilgan murojaatni to'ldirib qayta yuborish: `{"comment": "..."}` |

Holatlar:

| Kod | Nomi | Izoh |
|---|---|---|
| `new` | Yangi | |
| `accepted` | Qabul qilindi | |
| `in_progress` | Jarayonda | |
| `returned` | Qaytarildi | Talabadan qo'shimcha ma'lumot kutilmoqda. Sabab `comment` da. SLA to'xtatiladi. Talaba `resubmit` qiladi. |
| `completed` | Bajarildi | Yopiq |
| `rejected` | Rad etildi | Yopiq. Sabab `comment` da. |

Yopiq murojaatga xabar yoki fayl qo'shilsa `409` qaytadi.

Fayllar: PDF, JPG, PNG, WEBP, DOC, DOCX. Hajmi 20 MB gacha. Fayl turi mazmuni
bo'yicha tekshiriladi.

## 4. Webhook'lar

Talaba bilishi kerak bo'lgan har bir o'zgarish hamkor platformaga yuboriladi.
ROYD tomonida `WEBHOOK_URL` va `WEBHOOK_SECRET` sozlanadi (sirni ikki tomon
oldindan kelishib oladi, kamida 32 belgi).

```http
POST <WEBHOOK_URL>
Content-Type: application/json
X-ROYD-Event: request.status_changed
X-ROYD-Delivery: 3f9a0c1b2d4e5f6a7b8c9d0e
X-ROYD-Signature: sha256=<hex>
```

```json
{
  "id": "3f9a0c1b2d4e5f6a7b8c9d0e",
  "event": "request.status_changed",
  "occurred_at": "2026-09-28T09:15:00+00:00",
  "data": {
    "request_id": 42,
    "tracking_no": "REQ-2026-00042",
    "client_ref": "7f1c2e9a-...",
    "student_hemis_id": "3052211100123",
    "status": "returned",
    "status_label": "Qaytarildi",
    "sla_deadline": "2026-10-01T12:00:00+00:00",
    "old_status": "accepted",
    "comment": "Pasport nusxasini yuklang"
  }
}
```

| Hodisa | Qo'shimcha maydonlar (`data` ichida) |
|---|---|
| `request.created` | — |
| `request.status_changed` | `old_status`, `comment` |
| `request.message_created` | `message`: `id`, `content`, `sender_name`, `sender_role`, `from_student` |
| `request.file_added` | `file`: `id`, `file_name`, `file_size`, `mime_type`, `from_student` |

Ichki (xodimlar uchun) eslatmalar hech qachon yuborilmaydi.

**Imzoni tekshirish** — so'rov tanasining xom baytlari bo'yicha HMAC-SHA256:

```python
import hashlib, hmac

def verify(raw_body: bytes, header: str, secret: str) -> bool:
    expected = "sha256=" + hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header)
```

```js
const crypto = require("crypto");
function verify(rawBody, header, secret) {
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return header.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}
```

**Yetkazish kafolati:**

- Hodisa murojaatdagi o'zgarish bilan bitta tranzaksiyada yoziladi, shuning
  uchun yo'qolmaydi.
- `2xx` javob yetkazildi deb hisoblanadi. Boshqa javob yoki timeout (10 soniya)
  bo'lsa, qayta yuboriladi: 1, 2, 4, 8… daqiqadan keyin, jami 8 marta.
- Bir hodisa ikki marta kelishi mumkin. `X-ROYD-Delivery` (`id`) bo'yicha
  takrorlarni tashlab yuboring.
- Tartib kafolatlanmaydi. Holatni `occurred_at` bo'yicha yoki
  `GET /requests/{id}` orqali aniqlang.

## 5. Cheklovlar

- Umumiy: IP bo'yicha 30 so'rov/soniya. Tokenli mijoz uchun daqiqasiga
  120 o'qish va 30 yozish.
- Javob `429` bo'lsa, `Retry-After` sarlavhasida ko'rsatilgan vaqtdan keyin
  qayta urinib ko'ring.

## 6. Client ID / Client Secret (server-to-server)

Tashqi tizim talaba sessiyasisiz, **o'z nomidan** ishlaydi (OAuth2
`client_credentials`). U murojaatni talaba nomidan yaratadi va keyin kuzatadi.
Talaba ma'lumotlarini tizim o'zi yuboradi va ROYD ularga ishonadi.

### Kalit olish

ROYD administratori **Integratsiyalar** sahifasida (`/admin/api-clients`)
yangi integratsiya yaratadi va ruxsatlarni tanlaydi. Shundan keyin `client_id`
va `client_secret` beriladi. **Secret faqat bir marta ko'rsatiladi**, ROYD'da
uning faqat hash'i saqlanadi. Secret yo'qolsa yoki oshkor bo'lsa, admin
"Secret'ni yangilash" tugmasini bosadi. Shu zahoti eski secret ham, u bilan
olingan barcha tokenlar ham ishlamay qoladi. Integratsiyani nofaol qilish ham
xuddi shunday darhol ta'sir qiladi.

| Scope | Ruxsat |
|---|---|
| `requests:read` | O'zi yaratgan murojaatlarni, ularning fayllarini o'qish |
| `requests:write` | Talaba nomidan murojaat yaratish, xabar, fayl, qayta yuborish |
| `catalogs:read` | Xizmatlar katalogi |

### Token olish

```http
POST /api/v1/oauth/token
Authorization: Basic base64(client_id:client_secret)
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
```

`client_id` va `client_secret` ni Basic sarlavha o'rniga forma maydonlari
sifatida ham yuborish mumkin. `scope` (bo'sh joy bilan ajratilgan) berilmasa,
integratsiyaga ruxsat etilgan barcha scope'lar beriladi.

```json
{"access_token": "...", "token_type": "bearer", "expires_in": 3600, "scope": "requests:read requests:write catalogs:read"}
```

Refresh token yo'q: muddat tugaganda (`401`) yangi token so'rang. Xato
javoblari RFC 6749 formatida keladi: `{"error": "invalid_client",
"error_description": "..."}`. Mumkin bo'lgan qiymatlar: `invalid_request`,
`unsupported_grant_type`, `invalid_scope` (400), `invalid_client` (401).

### Endpointlar

Hammasi `Authorization: Bearer <access_token>` bilan chaqiriladi. Integratsiya
**faqat o'zi yaratgan murojaatlarni** ko'radi, boshqasiga `404` qaytadi.

| So'rov | Scope | Vazifasi |
|---|---|---|
| `GET /integration/categories` | `catalogs:read` | Xizmatlar katalogi |
| `POST /integration/requests` | `requests:write` | Murojaat yaratish (`Idempotency-Key` bilan) |
| `GET /integration/requests` | `requests:read` | Ro'yxat (`status`, `student_hemis_id`, `limit`, `offset`) |
| `GET /integration/requests/{id}` | `requests:read` | Tafsilot: holat, tarix, xabarlar, fayllar |
| `POST /integration/requests/{id}/messages` | `requests:write` | Talaba xabari: `{"content": "..."}` |
| `POST /integration/requests/{id}/files` | `requests:write` | Talaba fayli (`multipart/form-data`, maydon `upload`) |
| `GET /integration/requests/{id}/files/{file_id}` | `requests:read` | Faylni yuklab olish |
| `POST /integration/requests/{id}/resubmit` | `requests:write` | Qaytarilgan murojaatni qayta yuborish |

Scope yetishmasa, `403` qaytadi. Oddiy foydalanuvchi tokeni `/integration`
da, client tokeni esa `/requests` da ishlamaydi.

### Murojaat yaratish

```http
POST /api/v1/integration/requests
Authorization: Bearer <access_token>
Idempotency-Key: 7f1c2e9a-...
Content-Type: application/json

{
  "student": {
    "hemis_id": "3052211100123",
    "full_name": "Aliyev Vali",
    "faculty": {"name": "Axborot texnologiyalari", "hemis_id": "12"},
    "department": {"name": "Dasturiy injiniring"},          // ixtiyoriy
    "group": {"name": "IT-21", "hemis_id": "345"},          // ixtiyoriy
    "email": "vali@example.uz",                             // ixtiyoriy
    "phone": "+998901234567",                               // ixtiyoriy
    "specialty": "...", "level": 3, "education_form": "..." // ixtiyoriy
  },
  "category_id": 12,
  "service_type_id": 1,
  "title": "Ma'lumotnoma kerak",
  "description": "O'qish joyidan ma'lumotnoma"
}
```

- Talaba `hemis_id` bo'yicha topiladi. Topilmasa, yaratiladi. Topilsa, uning
  ma'lumotlari yuborilganlari bilan yangilanadi.
- Fakultet, kafedra va guruh avval `hemis_id`, keyin `name` bo'yicha
  qidiriladi. Topilmasa, yangisi yaratiladi. Murojaat shu fakultetga
  biriktirilgan registratorga tushadi. Registrator biriktirilmagan bo'lsa,
  `409` qaytadi va hech narsa saqlanmaydi.
- Javob kodlari §2 dagidek: `201`, `200` (shu `Idempotency-Key` bilan avval
  yaratilgan) va `400`. `409` esa registrator topilmaganda yoki
  `Idempotency-Key` bu talabaning boshqa integratsiya yaratgan murojaatida
  ishlatilgan bo'lsa qaytadi.

Xabarlar, fayllar va holat o'zgarishlari talaba nomidan yoziladi. Webhook'lar
(§4) bu murojaatlar uchun ham yuboriladi.
