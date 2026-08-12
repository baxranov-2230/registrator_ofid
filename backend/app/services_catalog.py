"""The Registrator office service catalogue: 6 service types, 59 services.

Transcribed from the official "Registrator ofisi tomonidan ko'rsatiladigan
xizmatlar ro'yxati". The catalogue is modelled with the existing
`RequestCategory` tree: a service type is a root row (`parent_id is None`) and
each service is a child of its type. No new tables are needed, and requests keep
pointing at a single `category_id` — the leaf service — from which the type is
recoverable through `parent_id`.

SLA hours per type are deliberate: informational lookups are quick, while
anything that produces a signed document or involves an external body is given
more room.
"""

#: (type name, sla_hours, priority, icon, [service names...])
SERVICE_CATALOG: list[tuple[str, int, str, str, list[str]]] = [
    (
        "Akademik (o'quv) faoliyati bo'yicha",
        48,
        "normal",
        "school",
        [
            "QR kodli diplom shakllantirish",
            "Akademik ma'lumotnoma va transkript berish",
            "Akademik mobillik asosida boshqa oliy ta'lim tashkilotiga ketgan "
            "talabalarning hujjatlarini tegishli tartibda rasmiylashtirish",
            "Bitiruvchi talabalar uchun aylanma varaqa yaratish",
            "Diplom dublikatini olish uchun ariza yuborishga ko'maklashish",
            "Imtihon natijalari bo'yicha apellyatsiya arizalarini qabul qilishni tashkil qilish",
            "Imtihonlar ro'yxatini shakllantirish va talabaga taqdim etish",
            "Oliy ta'lim tashkilotlari talabalariga o'qishni ko'chirish va qayta tiklash uchun "
            "ariza yuborishga ko'maklashish",
            "Oliy ta'lim tashkilotlarining magistratura bosqichiga kirish uchun "
            "abituriyentlarga onlayn ariza topshirishiga ko'maklashish",
            "Oliy ta'lim olganlik haqidagi diplom ma'lumotlarini qo'shish yoki tahrirlash "
            "uchun talabgorlarga ariza yuborishga ko'maklashish",
            "Stipendiya va turli grant tanlovlarida ishtirok etish uchun ariza qabul qilish",
            "Talabaga o'zining GPA ko'rsatkichi haqida ma'lumotnoma taqdim etish",
            "Talabalar davomatini amaldagi tartibga asosan sababli va sababsiz holatga o'tkazish",
            "Talabalar uchun tegishli fanlardan shaxsiy grafik yaratish",
            "Talabalar hujjatlarini qabul qilish va arxivga topshirish",
            "Talabalarga imtihon natijalarini taqdim etish",
            "Talabalarga qayta o'qish uchun ariza berishga ko'maklashish",
            "Talabalarga turli xil ma'lumotnoma (o'qish joyidan v.b.)lar berish",
            "Talabalarga o'quv varaqa taqdim etish",
            "Talabalarga fan resurslari bo'yicha ma'lumot taqdim etish",
            "Talabalarni HEMIS platformasida keyingi kursga o'tkazish",
            "Talabalarni o'zlashtirish ko'rsatkichlari haqida ma'lumot taqdim etish",
            "Talabalarning joriy, oraliq va davomat natijalariga ko'ra yakuniy nazoratlarda "
            "ishtirok etishiga ruxsat berish",
            "Talabalarning parolini tiklash",
            "Talabalarning shaxsiy hamda o'quv ma'lumotlarini tahrirlash",
            "Talabalik guvohnomasini tayyorlash va talabalarga taqdim etish",
            "Talabani bir guruhdan ikkinchi guruhga ko'chirib o'tkazish",
            "Tashqi xizmatlar: Ijtimoiy himoya reyestri va ayollar daftarida turuvchi "
            "talabalar yagona reestri bazasidan sinxronizatsiya qilib ro'yxat shakllantirish",
            "O'qishini ko'chirishga tavsiya etilgan, o'qishga tiklangan yoki kursda qolgan "
            "talabalarning o'quv rejalaridagi fanlar farqini aniqlash",
            "O'quv dasturlari haqida ma'lumot berish",
        ],
    ),
    (
        "Yoshlar masalalari va ma'naviy-ma'rifiy faoliyat bo'yicha",
        72,
        "normal",
        "diversity_3",
        [
            "Talabalarga yotoqxonalarga joylashish uchun ariza berishga ko'maklashish",
            "Ijara subsidiyasi uchun ariza yozishga ko'maklashish",
        ],
    ),
    (
        "Xalqaro aloqalar faoliyati bo'yicha",
        72,
        "normal",
        "public",
        [
            "Talabalarga o'qish joyidan ingliz tilida ma'lumotnoma berish",
            "Turli xalqaro grantlar va akademik mobillik dasturlari bo'yicha ma'lumotlarni "
            "taqdim etish",
            "O'qishga qabul qilingan xorijlik talabalarni elektron tizimda ro'yxatga olish va "
            "fanlarga biriktirish",
            "Xorijiy oliygohlarda tahsil olishda konsultatsiya berish",
            "Xorijlik talabalar uchun viza rasmiylashtirish amalga oshirish",
            "Xorijlik talabalarga to'lov-shartnomalarini taqdim etish",
            "Xorijlik talabalarni O'zbekiston Respublikasida vaqtinchalik ro'yxatga qo'yish "
            "xizmatlarini amalga oshirish",
            "Xorijlik talabalarni o'qishga qabul qilish bo'yicha konsultatsiya berish, ariza va "
            "talab etiladigan hujjatlarni ko'rib chiqish uchun qabul qilish",
        ],
    ),
    (
        "Buxgalteriya va marketing bo'yicha",
        72,
        "high",
        "payments",
        [
            "Qayta o'qishga shartnoma berish",
            "Stipendiya to'g'risida ma'lumotnoma berish",
            "Hisob varag'ini shakllantirib berish",
            "Talabalarga to'lov-shartnomasi olish uchun ariza berishga ko'maklashish",
            "Talabaning yotoqxonalarga joylashish shartnomasi bo'yicha qarzdorligi va "
            "haqdorligi haqida ma'lumot berish",
            "Talabaning qayta o'qish shartnomasi bo'yicha qarzdorligi va haqdorligi haqida "
            "ma'lumot berish",
            "Talabaning to'lov-shartnomasi bo'yicha qarzdorligi va haqdorligi haqida ma'lumot "
            "berish",
            "To'lov-shartnoma summasi haqida ma'lumot berish",
            "Bitiruvchi talabalarga bo'lg'usi ish o'rni to'g'risida kengroq axborotlar berish, "
            "mehnat yarmarkalarni o'tkazishga ko'maklashish",
        ],
    ),
    (
        "Ilmiy faoliyat bo'yicha",
        72,
        "normal",
        "science",
        [
            "Grantlar va tanlovlar haqida ma'lumot berish",
            "Ilmiy konferensiyalar haqida ma'lumot berish",
            "Innovatsion g'oya va startaplarni ro'yxatdan o'tkazishga ko'maklashish",
            "Nomdor stipendiyalar haqida ma'lumot berish",
            "Ilmiy loyihalar to'g'risida konsultatsiya berish",
            "Ustoz-shogird maktabiga a'zo bo'lishga ko'maklashish",
        ],
    ),
    (
        "Ko'rsatilishi zarur bo'lgan boshqa qo'shimcha xizmatlar",
        48,
        "normal",
        "more_horiz",
        [
            "Talabalarga tibbiy sug'urta olish uchun yordam berish",
            "O'qishga qabul va o'qishni ko'chirish yuzasidan konsultatsiya berish",
            "Talabalarga ishga joylashish borasida tavsiyalar berish",
            "Talabalarga NDKTUda mavjud turli xizmatlar va resurslar haqida ma'lumot berish",
        ],
    ),
]


def total_services() -> int:
    return sum(len(services) for *_, services in SERVICE_CATALOG)
