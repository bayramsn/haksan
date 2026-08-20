-- Sözleşme çıktısında sabit kodlu iki madde artık şart olarak saklanır.
--
-- 3.3 her zaman "K.D.V. dahil değildir", 2.6 her zaman "nakliye ve sigorta
-- ALICIYA aittir" basıyordu. SL-8 örneğinde ikisi de tersidir (KDV dahil,
-- nakliyeyi satıcı üstlenir) ve bu maddeler pazarlığa açık — belge başına
-- değişebilmeleri gerekir. `import_costs_excluded` ile aynı yolu izlerler:
-- teklifte ön-dolgu, belgenin kendi `terms` alanında geçersiz kılınabilir.
--
-- Varsayılanlar bugünkü çıktıyı korur: KDV hariç, nakliye alıcıya ait.
ALTER TABLE "quote_terms" ADD COLUMN IF NOT EXISTS "vat_included" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "quote_terms" ADD COLUMN IF NOT EXISTS "freight_paid_by_seller" boolean NOT NULL DEFAULT false;
