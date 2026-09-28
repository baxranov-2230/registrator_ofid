# ROYD — hamkor platforma bilan integratsiya

Talabalar murojaatni ROYD veb-ilovasida emas, universitetning talabalar
platformasida yuboradi va kuzatadi. Bu hujjat o'sha platforma ROYD API'si bilan
qanday ishlashini tavsiflaydi. To'liq sxema: [`openapi.json`](openapi.json)
(`make openapi` bilan yangilanadi).

Barcha yo'llar `https://<ROYD domeni>/api/v1` ostida. Xatolar FastAPI
formatida keladi: `{"detail": "..."}`, validatsiya xatosi (422) esa
`{"detail": [{"loc": [...], "msg": "..."}]}`.

## 1. Autentifikatsiya

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
