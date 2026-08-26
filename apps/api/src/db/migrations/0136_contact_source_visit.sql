-- Firma kaynağı olarak "Ziyaret": saha ziyaretinden gelen firmalar fuar/arama
-- kalemlerine sıkıştırılmadan işaretlenebilsin. Lookup satırı idempotent eklenir.
INSERT INTO "contact_sources" ("code", "name", "sort_order", "is_active")
VALUES ('visit', 'Ziyaret', 6, true)
ON CONFLICT ("code") DO NOTHING;
