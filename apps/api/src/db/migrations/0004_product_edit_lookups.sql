ALTER TABLE "product_models" ADD COLUMN IF NOT EXISTS "image_url" varchar(512);
--> statement-breakpoint
INSERT INTO "product_groups" ("code", "name", "sort_order") VALUES
  ('CNC', 'CNC', 10),
  ('UNIVERSAL', 'Üniversal', 20),
  ('SAC_ISLEME', 'Sac İşleme', 30)
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
INSERT INTO "product_categories" ("code", "name", "sort_order") VALUES
  ('TEZGAH', 'Tezgah', 10),
  ('YEDEK_PARCA', 'Yedek Parça', 20),
  ('OPSIYONEL_DONANIM', 'Opsiyonel Donanım', 30),
  ('ISCILIK', 'İşçilik', 40),
  ('AKSESUAR', 'Aksesuar', 50)
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
INSERT INTO "product_subcategories" ("code", "name", "sort_order") VALUES
  ('ISLEME_MERKEZI', 'İşleme Merkezi', 10),
  ('TORNA', 'Torna', 20)
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
INSERT INTO "product_types" ("code", "name", "sort_order") VALUES
  ('CNC_DIK_ISLEME_MERKEZ', 'CNC Dik İşleme Merkezi', 10),
  ('CNC_YATAY_ISLEME_MERKEZI', 'CNC Yatay İşleme Merkezi', 20),
  ('CNC_KOPRU_TIPI_ISLEME_MERKEZI', 'CNC Köprü Tipi İşleme Merkezi', 30),
  ('CNC_5_EKSEN_ISLEME_MERKEZI', 'CNC 5 Eksen İşleme Merkezi', 40),
  ('CNC_YATAY_TORNA_TEZGAHI', 'CNC Yatay Torna Tezgahı', 50),
  ('CNC_DIK_TORNA_TEZGAHI', 'CNC Dik Torna Tezgahı', 60),
  ('ELEKTRONIK', 'Elektronik', 70),
  ('ELEKTRIK', 'Elektrik', 80),
  ('MEKANIK', 'Mekanik', 90),
  ('KONTROL_UNITESI', 'Kontrol Ünitesi', 100),
  ('SPINDLE', 'Spindle', 110),
  ('ISCILIK', 'İşçilik', 120),
  ('YAG_SIYIRICI', 'Yağ Sıyırıcı', 130),
  ('TUTUCU_TAKIMLAR', 'Tutucu & Takımlar', 140),
  ('DIVIZOR', 'Divizör', 150),
  ('REGULATOR', 'Regülatör', 160)
ON CONFLICT ("code") DO NOTHING;
