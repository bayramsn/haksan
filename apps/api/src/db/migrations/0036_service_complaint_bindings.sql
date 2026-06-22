UPDATE service_tickets
SET source = 'qr'
WHERE source = 'passport';

UPDATE service_complaint_intakes
SET source = 'qr'
WHERE source = 'passport';

INSERT INTO file_document_types (code, name, description, sort_order, is_active)
VALUES
  ('service_complaint_evidence', 'Şikayet Kanıtı', 'Şikayet kutusu için müşteri/personel kanıt dosyası', 75, true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  updated_at = now();
