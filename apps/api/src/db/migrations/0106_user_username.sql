-- Kullanıcı adı ile giriş.
--
-- E-posta alanı KALDIRILMAZ: bildirim/iletişim için gerekli ve girişte de
-- çalışmaya devam eder. `username` yalnızca ek bir giriş tanımlayıcısıdır.
--
-- Mevcut kullanıcıların yayından sonra kilitlenmemesi için e-postanın yerel
-- bölümünden güvenli ve deterministik bir kullanıcı adı türetilir. Aynı tenant
-- içindeki çakışmalarda kullanıcı UUID'sinden kısa bir ek kullanılır.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "username" varchar(32);--> statement-breakpoint

WITH normalized AS (
  SELECT
    "id",
    "tenant_id",
    CASE
      WHEN length(regexp_replace(lower(split_part("email", '@', 1)), '[^a-z0-9._-]+', '', 'g')) >= 3
        THEN left(regexp_replace(lower(split_part("email", '@', 1)), '[^a-z0-9._-]+', '', 'g'), 32)
      ELSE 'user_' || left(replace("id"::text, '-', ''), 8)
    END AS base_username
  FROM "users"
  WHERE "username" IS NULL
), ranked AS (
  SELECT
    "id",
    base_username,
    row_number() OVER (PARTITION BY "tenant_id", base_username ORDER BY "id") AS duplicate_no
  FROM normalized
)
UPDATE "users" AS target
   SET "username" = CASE
     WHEN ranked.duplicate_no = 1 THEN ranked.base_username
     ELSE left(ranked.base_username, 23) || '_' || left(replace(target."id"::text, '-', ''), 8)
   END
  FROM ranked
 WHERE target."id" = ranked."id";--> statement-breakpoint

-- Kolon yeni olduğu için normalde boştur; migration tekrar çalıştırılırsa veya
-- elle veri girildiyse saklanan biçimi (küçük harf, boşluksuz) garanti eder.
UPDATE "users"
   SET "username" = lower(btrim("username"))
 WHERE "username" IS NOT NULL
   AND "username" <> lower(btrim("username"));--> statement-breakpoint

-- Benzersizlik TENANT İÇİNDE ve büyük/küçük harf duyarsızdır:
-- `Raifsenturk` ile `raifsenturk` aynı kullanıcı adı sayılır, ama iki farklı
-- tenant aynı kullanıcı adını kullanabilir (çok kiracılı kurulum).
-- Postgres unique index'te NULL'ları birbirinden farklı saydığı için kullanıcı
-- adı boş olan sınırsız sayıda kayıt yan yana durabilir; partial index gerekmez.
CREATE UNIQUE INDEX IF NOT EXISTS "users_tenant_username_unique"
    ON "users" USING btree ("tenant_id", lower("username"));--> statement-breakpoint

-- Giriş sorgusu `lower(email) = $1` ile eşleştiğinden mevcut düz "users_email_idx"
-- kullanılamaz. İfade indeksi olmadan her giriş denemesi users üzerinde seq scan
-- yapardı — kimlik doğrulaması gerektirmeyen bir uçta bu bir DoS çarpanıdır.
CREATE INDEX IF NOT EXISTS "users_email_lower_idx"
    ON "users" USING btree (lower("email"));
