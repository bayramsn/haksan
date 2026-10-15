-- Kullanıcının CRM'den giden maillerine eklenen imza. NULL = profilden üretilen
-- varsayılan imza, boş metin = imzasız.
ALTER TABLE "user_mail_accounts" ADD COLUMN IF NOT EXISTS "signature" text;
