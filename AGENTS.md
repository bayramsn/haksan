# Güvenlik Öncelikli Vibe Coding Kuralları

Bu dosya Codex ve Antigravity ajanları için proje kök talimatıdır. Bu monorepo içinde üretilen her uygulama aşağıdaki güvenlik kurallarına uymak zorundadır. Kurallar secret yönetimi, rate limiting, input validation, auth, SQL injection, CORS, güvenlik header'ları, dosya yükleme, hata yönetimi, bağımlılık güvenliği, deploy kontrol listesi ve AI/LLM özel risklerini kapsar.

## Özet

| # | Konu | Neyi Kapsıyor |
|---|---|---|
| 1 | Açıkta Kalan Secret'lar | Sadece `.env`, `.gitignore`, frontend'de key yok |
| 2 | Rate Limiting | Endpoint başına limitler, 429 yanıtları, önerilen kütüphaneler |
| 3 | Input Validation | Zod/Pydantic şemaları, sadece sunucu tarafı, parametreli sorgular |
| 4 | Auth & Yetkilendirme | Düz metin parola yok, JWT en iyi pratikleri, rol kontrolleri |
| 5 | SQL Injection | Önce ORM, asla string birleştirmeli sorgu |
| 6 | CORS | Production'da wildcard `*` yok |
| 7 | HTTP Güvenlik Header'ları | Helmet, CSP, HSTS, clickjacking önleme |
| 8 | Dosya Yükleme Güvenliği | MIME doğrulama, boyut limitleri, UUID ile yeniden adlandırma |
| 9 | Hata Yönetimi | İstemciye stack trace yok, yapısal loglama |
| 10 | Bağımlılık Güvenliği | `npm audit`, sabitlenmiş versiyonlar |
| 11 | XSS Önleme | `dangerouslySetInnerHTML` yok, `eval()` yok |
| 12 | Deploy Kontrol Listesi | Her yayından önce ön kontrol |
| AI/LLM | AI/LLM Özel | Prompt injection, token bütçeleri, sunucu tarafı API key'leri |

## 1. Secret'lar & Ortam Değişkenleri

Secret'ları asla frontend kodunda açığa çıkarma.

- Tüm API key'leri, token'lar, veritabanı URL'leri, servis kimlik bilgileri ve özel config sadece `.env` dosyalarında bulunmalı.
- `.env` dosyaları `.gitignore` içinde listelenmeli. Her zaman `.env`, `.env.local`, `.env.*.local` hariç tutulmalı.
- Frontend kodu, React, Vue veya düz JS fark etmeksizin, asla ham secret değeri içermemeli. İstemci tarafı dosyalarda `const API_KEY = "sk-..."` yazma.
- Next.js/Vite gibi framework'lerde sadece `NEXT_PUBLIC_` veya `VITE_` ön ekli değişkenler frontend'e aittir ve bunlar asla secret key olmamalı.
- Backend/sunucu-özel secret'lara `process.env.VAR_NAME` üzerinden erişilmeli ve API yanıtlarında asla istemciye dönülmemeli.
- Gerekli tüm değişken adlarını boş değerlerle içeren bir `.env.example` dosyası üret.
- Bir secret istemci tarafında kullanılmak zorundaysa, örneğin Stripe publishable key, bunun kasıtlı olarak açığa çıkarılan publishable/public key olduğunu açıkça yorum olarak belirt.

```js
// Doğru
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Yanlış
const stripe = require('stripe')('sk_live_abc123...');
```

## 2. Rate Limiting

Dışarıya açık her endpoint'te rate limiting olmalı.

- Tüm API route'larında rate limiting uygula; özellikle auth, form gönderimleri, AI completion'ları, dosya yüklemeleri ve pahalı işlemlerde.
- Auth endpoint'leri için IP başına 15 dakikada 5 istek sınırı kullan.
- Genel API için IP başına dakikada 60 istek sınırı kullan.
- AI/LLM proxy endpoint'leri için kullanıcı başına dakikada 10 istek sınırı kullan.
- Dosya yüklemeleri için IP başına dakikada 5 istek sınırı kullan.
- Stack'e uygun kütüphaneler kullan: Node/Express için `express-rate-limit`, Next.js için `next-rate-limit` veya `lru-cache`, Python/FastAPI için `slowapi`, Python/Flask için `Flask-Limiter`, Edge/Vercel için KV tabanlı sayaçlar veya Upstash Redis.
- Limit aşıldığında `Retry-After` header'ı ile `429 Too Many Requests` dön.
- Rate limit hatalarını frontend'de asla sessizce yutma; kullanıcıya net bir mesaj göster.

```js
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api/', limiter);
```

## 3. Input Validation & Sanitization

Kullanıcı girdisine asla güvenme. Her şeyi doğrula ve temizle.

- Tüm girdileri sunucu tarafında doğrula. İstemci tarafı doğrulama sadece UX içindir, güvenlik garantisi değildir.
- JS/TS için `zod`, `yup` veya `joi`; Python için `pydantic` gibi şema doğrulama kütüphaneleri kullan.
- XSS'i önlemek için tüm string girdileri saklamadan veya göstermeden önce temizle.
- Parametreli sorgular veya ORM metotları kullan. Kullanıcı girdisini asla ham SQL veya NoSQL sorgusuna gömme.
- Veri tipi, uzunluk/boyut limitleri, izin verilen karakterler, zorunlu alanlar ve enum değerlerini doğrula.
- Dosya yüklemeleri için MIME tipini, dosya uzantısını ve dosya boyutunu sunucu tarafında doğrula.
- Geçersiz girdi için net `400 Bad Request` hatası dön ve denemeyi logla.

```ts
import { z } from 'zod';

const schema = z.object({
  email: z.string().email().max(254),
  message: z.string().min(1).max(1000).trim(),
});

const result = schema.safeParse(req.body);
if (!result.success) return res.status(400).json({ error: result.error });
```

## 4. Kimlik Doğrulama & Yetkilendirme

Yerleşik auth kütüphaneleri kullan. Auth'u sıfırdan yazma.

- Önerilenler: NextAuth.js, Clerk, Supabase Auth, Auth0, Passport.js, Lucia Auth.
- Parolalar asla düz metin olarak saklanmamalı. `bcrypt` için en az cost 12 veya `argon2` kullan.
- JWT'ler güçlü bir secret ile imzalanmalı. `JWT_SECRET` env'den gelmeli ve en az 32 karakter olmalı.
- JWT access token süresini kısa tut, genellikle 15 dakika ile 1 saat arası.
- Refresh token'lar güvenli saklanmalı; `httpOnly` cookie kullan, `localStorage` kullanma.
- Her istekte kullanıcının kimliğini ve istenen kaynağa erişim iznini doğrula.
- Tekrarlanan başarısız giriş denemelerinden sonra hesap kilitleme uygula.
- Admin route'ları veya hassas işlemler için açık bir rol/izin kontrolü ekle.

```ts
const post = await db.post.findUnique({ where: { id } });
if (!post || post.authorId !== session.user.id) {
  return res.status(403).json({ error: 'Forbidden' });
}
```

## 5. SQL & Veritabanı Güvenliği

Her zaman ORM veya parametreli sorgular kullan.

- Prisma, Drizzle, SQLAlchemy, Mongoose veya parametreli sorgular tercih et.
- Sorguları asla kullanıcı verisiyle string birleştirerek oluşturma.
- En az ayrıcalık ilkesini uygula. DB kullanıcısı sadece gerçekten ihtiyaç duyduğu izinlere sahip olmalı.
- Her DB yazımından önce tüm alanları temizle ve doğrula.
- Ham DB hatalarını istemciye dönme; şema bilgisi sızdırırlar.

```ts
// Güvenli
const user = await db.query('SELECT * FROM users WHERE email = $1', [email]);

// Güvensiz
const user = await db.query(`SELECT * FROM users WHERE email = '${email}'`);
```

## 6. CORS Yapılandırması

Production'da wildcard CORS kullanma.

- Sadece API'ne erişmesi gereken origin'leri açıkça allowlist'e al.
- İzin verilen HTTP metotlarını her endpoint'in ihtiyaç duyduğuyla sınırla.
- Credentials gereken endpoint'lerde origin listesini özellikle dar tut.

```ts
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN,
  methods: ['GET', 'POST'],
  credentials: true,
}));
```

## 7. HTTP Güvenlik Header'ları

Her zaman güvenlik header'ları ayarla.

- Node tarafında `helmet`, Django tarafında `django-csp` kullan veya header'ları manuel ayarla.
- `Content-Security-Policy` ile script/style kaynaklarını sınırla.
- `X-Frame-Options: DENY` ile clickjacking'i önle.
- `X-Content-Type-Options: nosniff` ayarla.
- `Strict-Transport-Security` ile HTTPS'i zorla.
- `Referrer-Policy: strict-origin-when-cross-origin` ayarla.
- Framework bilgisini sızdırmamak için `X-Powered-By` header'ını kaldır.

## 8. Dosya Yükleme Güvenliği

Dosya tipini hem MIME tipiyle hem uzantıyla sunucu tarafında doğrula.

- İstemcinin beyan ettiği dosya tipine güvenme.
- Katı dosya boyutu limitleri ayarla; görseller için örnek limit 5 MB, dokümanlar için örnek limit 25 MB.
- Yüklenen dosyaları web kök dizininin dışında veya S3, GCS, Cloudinary gibi cloud bucket'larda sakla.
- Kullanıcı tarafından yüklenen dosyaları asla çalıştırılabilir izinlerle sunma.
- Yüklenen dosyaları UUID ile yeniden adlandır; orijinal dosya adını asla doğrudan kullanma.
- Hassas veya herkese açık yüklemeler için malware taraması yap.

## 9. Hata Yönetimi & Loglama

Production'da asla stack trace, ham hata mesajı veya iç yolları istemciye dönme.

- Kullanıcılara genel hata mesajları dön: "Bir şeyler ters gitti" gibi.
- `Error: Cannot read property of undefined at /src/routes/user.ts:42` gibi iç detayları istemciye sızdırma.
- Hataları sunucu tarafında bağlamla logla: zaman damgası, varsa kullanıcı ID'si, route ve temizlenmiş girdi.
- Production hata takibi için Sentry, Datadog veya Logtail gibi bir servis kullan.
- 4xx istemci hataları ile 5xx sunucu hataları arasında ayrım yap; doğrulama hataları için 500 kullanma.

## 10. Bağımlılık Güvenliği

Paket kurduktan sonra audit çalıştır ve high/critical sorunları düzelt.

- JS/TS için `npm audit`, Python için `pip-audit`, Rust için `cargo audit` kullan.
- Bakımsız paketlerden kaçın; güvenlikle ilgili kütüphanelerde 2 yıldan uzun süredir güncelleme yoksa özellikle dikkat et.
- Production'da bağımlılık versiyonlarını sabitle. `package-lock.json` veya `requirements.txt` gibi lock dosyalarını kullan.
- Aşırı izin isteyen veya şüpheli install script'leri olan paketleri incelemeden kurma.

## 11. Frontend İçin XSS & CSP

Dinamik kullanıcı içeriğini güvenli render et.

- İçerik DOMPurify ile tamamen temizlenmedikçe React'te `dangerouslySetInnerHTML` kullanma.
- Dinamik kullanıcı içeriğiyle asla `eval()`, `new Function()` veya `innerHTML` kullanma.
- Inline `<script>` etiketlerinden kaçın; CSP uygulamasını etkinleştirmek için JS'i harici dosyalara taşı.

## 12. Deploy Kontrol Listesi

Her deploy'dan önce şunları kontrol et:

- `.env` git'e commit edilmemiş.
- Tüm secret'lar hosting platformunun ortam değişkeni config'inde ayarlı.
- Debug modu ve development loglama production'da kapalı.
- Veritabanı herkese açık değil; mümkünse özel ağ arkasında connection pooling kullanılıyor.
- HTTPS zorunlu; production'da HTTP yok.
- Tüm public endpoint'lerde rate limiting aktif.
- CORS bilinen origin'lerle sınırlı.
- Kullanılmayan API route'ları kaldırılmış veya korunmuş.

## AI/LLM Özel Kuralları

Uygulama AI kullanıyorsa aşağıdaki kurallar zorunludur.

- Ham kullanıcı girdisini temizlemeden doğrudan LLM'e gönderme; prompt injection riskini azalt.
- Kaçak maliyetleri önlemek için LLM çağrılarında her zaman `max_tokens` limiti ayarla.
- API key'i sadece sunucu tarafında sakla. Tüm LLM çağrılarını backend üzerinden geçir, tarayıcıdan doğrudan çağrı yapma.
- Suistimali tespit edebilmek için kullanıcı başına LLM kullanımını ve token sayılarını logla.
- Maliyet saldırılarını önlemek için kullanıcı veya oturum başına token bütçeleri uygula.
- UI'da render etmeden önce LLM çıktısını doğrula ve temizle; üretilen HTML XSS riski taşır.
