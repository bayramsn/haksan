-- Süper yönetici başka bir kullanıcının takvimine görev/etkinlik yazabilsin.
-- Sahiplik zaten owner_user_id'de ayrı duruyordu; eksik olan tek şey görevin
-- kapanabilmesiydi. "Kim atadı" için ayrı kolon yok: created_by <> owner_user_id
-- olan kayıt atanmış kayıttır.
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "completed_at" timestamptz;
