# ROYD — hamkor platforma bilan integratsiya

Talabalar murojaatni ROYD veb-ilovasida emas, universitetning talabalar
platformasida yuboradi va kuzatadi. Bu hujjat o'sha platforma ROYD API'si bilan
qanday ishlashini tavsiflaydi. To'liq sxema: [`openapi.json`](openapi.json)
(`make openapi` bilan yangilanadi).

Barcha yo'llar `https://<ROYD domeni>/api/v1` ostida. Xatolar FastAPI
formatida keladi: `{"detail": "..."}`, validatsiya xatosi (422) esa
`{"detail": [{"loc": [...], "msg": "..."}]}`.

## 1. Autentifikatsiya

Hamkor platforma ROYD bilan faqat **o'z nomidan**, Client ID va Client Secret
orqali ishlaydi: [6-bo'lim](#6-client-id--client-secret-server-to-server).
Talabalar ROYD'ga kirmaydi va ularga token berilmaydi. Talaba ma'lumotlari
murojaat bilan birga yuboriladi.

- So'rovlar `Authorization: Bearer <access_token>` bilan yuboriladi.
- Chaqiruvlarni **hamkor platformaning serveridan** qiling. Brauzerdan
  chaqirilsa, CORS ruxsat bermaydi.

## 2. Murojaat yuborish

Xizmatlar katalogi (ikki bosqichli: murojaat turi → xizmat turi):

```http
GET /api/v1/integration/categories
```

Ildiz elementlar — **murojaat turlari** (`name`, `description` — tasnifi), ular
ichidagi `children` — **xizmat turlari**. Murojaat xizmat turi bo'yicha
yuboriladi. Xizmat turidagi `routing` murojaat qayerga tushishini bildiradi:

| `routing` | Ma'nosi |
|---|---|
| `auto_reply` | Tizim darhol `auto_reply_text` bilan javob beradi. Murojaat `completed` holatida qaytadi, `answer` to'ldirilgan. |
| `faculty_manager` | Talabaning fakultetiga biriktirilgan xodimga tushadi (quyida). |
| `general_manager` | Fakultetdan qat'i nazar, umumiy masalalar bo'yicha menejerga tushadi. |

SLA (`sla_hours`) va ustuvorlik (`priority`) ham xizmat turidan olinadi.

Murojaat yaratish — **har doim `Idempotency-Key` bilan** (1–64 belgi, har bir
yangi murojaat uchun yangi): `POST /api/v1/integration/requests`. Body va
maydonlar: [6-bo'lim, «Murojaat yaratish»](#murojaat-yaratish).

| Javob | Ma'nosi |
|---|---|
| `201` | Murojaat yaratildi. |
| `200` | Shu kalit bilan murojaat avval yaratilgan — o'sha qaytarildi. Tarmoq xatosidan keyin qayta yuborish xavfsiz. |
| `409` | Mas'ul topilmadi: talabaning fakultetiga hech bir xodim (na xodim, na registrator) biriktirilmagan, profilda fakultet yo'q yoki umumiy masalalar bo'yicha menejer yo'q. Talabaga matnni ko'rsating. |
| `400` | Xizmat turi topilmadi, faol emas yoki murojaat turiga mos emas. |

`faculty_manager` xizmat turlarida murojaat talabaning fakulteti (va bo'limi)
ga biriktirilgan xodimga avtomatik yo'naltiriladi va darhol `in_progress`
holatida qaytadi. Fakultetda xodim bo'lmasa, fakultet registratoriga tushadi.
`general_manager` da umumiy masalalar bo'yicha menejerga tushadi, u ham
`in_progress` bo'ladi. `auto_reply` da murojaat darhol `completed` bo'ladi:
`request.created` dan keyin `request.status_changed` webhook'i `answer` bilan
keladi (`answered_by_name` — `null`). Ijro muddati
(`sla_deadline`) faqat ish kunlari (dushanba–juma, bayramlarsiz) bo'yicha
hisoblanadi.

## 3. Kuzatish va yozishma

| So'rov | Vazifasi |
|---|---|
| `GET /integration/requests` | Integratsiya yaratgan murojaatlar (`limit`, `offset`, `status`, `student_hemis_id`) |
| `GET /integration/requests/{id}` | Tafsilot: holat, tarix, xabarlar, fayllar, yakuniy javob (`answer`) |
| `POST /integration/requests/{id}/messages` | Talaba xabari: `{"content": "..."}` |
| `POST /integration/requests/{id}/files` | Fayl (`multipart/form-data`, maydon nomi `upload`) |
| `GET /integration/requests/{id}/files/{file_id}` | Faylni yuklab olish (masalan, tayyor hujjat) |
| `POST /integration/requests/{id}/resubmit` | Qaytarilgan murojaatni to'ldirib qayta yuborish: `{"comment": "..."}` |

Holatlar — jarayon **Yangi → Jarayonda → Javob berildi**:

| Kod | Nomi | Izoh |
|---|---|---|
| `new` | Yangi | Yuborilgan payt. Yo'naltirilgach darhol `in_progress` ga o'tadi. |
| `in_progress` | Jarayonda | Mas'ul xodim ko'rib chiqmoqda. |
| `returned` | Qaytarildi | Talabadan qo'shimcha ma'lumot kutilmoqda. Sabab `comment` da. SLA to'xtatiladi. Talaba `resubmit` qiladi, murojaat yana `in_progress` ga qaytadi. |
| `completed` | Javob berildi | Yopiq. Xodimning yakuniy javobi `answer` da. |
| `accepted`, `rejected` | Qabul qilindi, Rad etildi | Eski tartibdan qolgan yozuvlarda uchraydi; yangi murojaatlar bu holatlarga o'tmaydi. |

Murojaat faqat xodimning **yakuniy javobi** bilan yopiladi. Javob tafsilotda
`answer` maydonida keladi (javob berilmaguncha `null`):

```json
"answer": {
  "text": "Ma'lumotnoma tayyor, ilovada.",
  "answered_at": "2026-09-29T10:20:00+00:00",
  "answered_by": 4,
  "answered_by_name": "Aziz Toshev",
  "files": [
    {"id": 7, "file_name": "malumotnoma.pdf", "file_size": 48213,
     "mime_type": "application/pdf", "is_answer": true, "...": "..."}
  ]
}
```

Javob fayllari `files` ro'yxatida ham `is_answer: true` bilan turadi va odatdagi
`GET /integration/requests/{id}/files/{file_id}` orqali yuklab olinadi.

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
    "old_status": "in_progress",
    "comment": "Pasport nusxasini yuklang"
  }
}
```

| Hodisa | Qo'shimcha maydonlar (`data` ichida) |
|---|---|
| `request.created` | — |
| `request.status_changed` | `old_status`, `comment`; `completed` ga o'tganda `answer`: `text`, `answered_at`, `answered_by_name`, `files` |
| `request.message_created` | `message`: `id`, `content`, `sender_name`, `sender_role`, `from_student` |
| `request.file_added` | `file`: `id`, `file_name`, `file_size`, `mime_type`, `from_student`, `is_answer` |

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
  `GET /integration/requests/{id}` orqali aniqlang.

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

Talaba LMS'da ariza yuborganda LMS talabaning ma'lumotlarini arizaning o'z
maydonlari bilan bitta body'da yuboradi:

```http
POST /api/v1/integration/requests
Authorization: Bearer <access_token>
Idempotency-Key: 7f1c2e9a-...
Content-Type: application/json

{
  "student_hemis_id": "3052211100123",
  "full_name": "Aliyev Vali Valiyevich",
  "image": "https://lms.example.uz/photos/3052211100123.jpg",
  "faculty": "Axborot texnologiyalari",
  "group": "IT-21",
  "course": 3,
  "category_id": 12,
  "service_type_id": 1,
  "title": "Ma'lumotnoma kerak",
  "description": "O'qish joyidan ma'lumotnoma"
}
```

| Maydon | Majburiy | Izoh |
|---|---|---|
| `student_hemis_id` | ha | Talaba ID (HEMIS raqami), 1–64 belgi |
| `full_name` | ha | F.I.Sh., 255 belgigacha |
| `image` | yo'q | Rasm havolasi, faqat `http(s)://`, 500 belgigacha. Xodimlar sahifasida shu havola bo'yicha ko'rsatiladi |
| `faculty` | ha | Fakultet nomi |
| `group` | ha | Guruh nomi |
| `course` | ha | Kurs, butun son 1–7 (HEMIS kodi emas: 1-kurs uchun `1`, `11` emas) |
| `category_id` | ha | Xizmat turi (katalogdagi barg), `GET /integration/categories` dan |
| `service_type_id` | yo'q | Murojaat turi (ildiz). Berilsa, xizmat turiga mos bo'lishi shart |
| `title` | ha | 3–500 belgi |
| `description` | ha | 3–10000 belgi |

- Talaba `student_hemis_id` bo'yicha topiladi. Topilmasa, yaratiladi. Topilsa,
  F.I.Sh., rasm, fakultet, guruh va kurs yuborilganlari bilan yangilanadi. `image`
  yuborilmasa, avvalgi rasm saqlanib qoladi.
- Fakultet nomi bo'yicha qidiriladi, guruh esa shu fakultet ichida nomi
  bo'yicha qidiriladi. Topilmasa, yangisi yaratiladi. `faculty_manager` xizmat
  turlarida murojaat shu fakultetga biriktirilgan xodimga (bo'limi mos kelgani
  afzal), u bo'lmasa fakultet registratoriga tushadi (boshqa yo'nalishlar:
  [§2](#2-murojaat-yuborish)). Hech kim biriktirilmagan bo'lsa
  (masalan, fakultet nomida xato bo'lsa), `409` qaytadi va hech narsa
  saqlanmaydi. Shuning uchun fakultet nomlari ROYD'dagi nomlar bilan bir xil
  bo'lishi kerak.
- Javobdagi `student_id` ROYD'ning ichki raqami, u `student_hemis_id` emas.
- Javob kodlari §2 dagidek: `201`, `200` (shu `Idempotency-Key` bilan avval
  yaratilgan) va `400`. `409` esa mas'ul xodim topilmaganda yoki
  `Idempotency-Key` bu talabaning boshqa integratsiya yaratgan murojaatida
  ishlatilgan bo'lsa qaytadi. Majburiy maydon yetishmasa, `422` qaytadi.

Xabarlar, fayllar va holat o'zgarishlari talaba nomidan yoziladi. Webhook'lar
(§4) bu murojaatlar uchun ham yuboriladi.
