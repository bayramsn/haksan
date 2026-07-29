-- Satış derecesi ile operasyon aşamasını hizalar.
--
-- İki eksen bugüne kadar birbirinden bağımsız yazıldığı için kartların yarıdan
-- fazlası tutarsız kalmıştı (en büyük grup: derece C, aşama hâlâ "lead").
-- Ekip derece eksenini kullandığından doğru bilgi orada kabul edilir ve
-- operasyon aşaması derecenin giriş noktasına çekilir.
--
-- İki koruma vardır:
--   1) Kartın mevcut aşaması ZATEN hedef derecenin alanındaysa dokunulmaz.
--      Aksi hâlde B/"Ziyaret" kartı B'nin giriş aşaması olan "Arama"ya geri
--      çekilir, yani kendi alanı içinde geriye götürülmüş olurdu.
--   2) Yalnız kapısı olmayan giriş aşamaları doldurulur. "quote" (teklif kaydı
--      ister) ve "commercial_invoice" (ödeme planı + fatura dosyası ister)
--      aşamalarına veri uydurarak taşımak olmayan bir faturayı varmış gibi
--      gösterirdi; A ve A+ derecesindeki tutarsız kartlar elle incelenmek
--      üzere olduğu gibi bırakılır.

CREATE TEMPORARY TABLE IF NOT EXISTS tmp_stage_grade (stage_code text, grade text) ON COMMIT DROP;--> statement-breakpoint

INSERT INTO tmp_stage_grade (stage_code, grade) VALUES
  ('lead', 'lead'),
  ('sales', 'c'),
  ('call', 'b'),
  ('visit', 'b'),
  ('quote', 'a'),
  ('proforma', 'a'),
  ('contract', 'a'),
  ('payment_plan', 'a'),
  ('commercial_invoice', 'a_plus'),
  ('customs_approved', 'a_plus'),
  ('stock_picking', 'a_plus'),
  ('shipping', 'a_plus'),
  ('installation', 'a_plus'),
  ('delivered', 'win'),
  ('cancelled', 'lost');--> statement-breakpoint

CREATE TEMPORARY TABLE IF NOT EXISTS tmp_grade_entry (grade text, stage_code text) ON COMMIT DROP;--> statement-breakpoint

-- Yalnız kapısız giriş aşamaları; 'a' ve 'a_plus' bilerek yok.
INSERT INTO tmp_grade_entry (grade, stage_code) VALUES
  ('lead', 'lead'),
  ('c', 'sales'),
  ('b', 'call'),
  ('win', 'delivered'),
  ('lost', 'cancelled');--> statement-breakpoint

CREATE TEMPORARY TABLE IF NOT EXISTS tmp_align_target (
  opportunity_id uuid,
  tenant_id uuid,
  from_stage_id uuid,
  to_stage_id uuid
) ON COMMIT DROP;--> statement-breakpoint

INSERT INTO tmp_align_target (opportunity_id, tenant_id, from_stage_id, to_stage_id)
SELECT o.id, o.tenant_id, o.current_stage_id, ps_to.id
FROM opportunities o
JOIN tmp_grade_entry e ON e.grade = o.qualification_stage
JOIN pipeline_stages ps_to ON ps_to.code = e.stage_code
JOIN pipeline_stages ps_from ON ps_from.id = o.current_stage_id
JOIN tmp_stage_grade sg ON sg.stage_code = ps_from.code
WHERE o.deleted_at IS NULL
  AND ps_from.code <> ps_to.code
  -- Koruma 1: mevcut aşama zaten bu derecenin alanındaysa karışma.
  AND sg.grade <> o.qualification_stage
  -- Terminal aşamadaki kartı geri almayız; yalnız geride kalanlar ilerletilir.
  AND ps_from.code NOT IN ('delivered', 'cancelled');--> statement-breakpoint

INSERT INTO opportunity_stage_history (tenant_id, opportunity_id, from_stage_id, to_stage_id, changed_by, change_reason)
SELECT tenant_id, opportunity_id, from_stage_id, to_stage_id, NULL, 'Derece ile hizalama (0092)'
FROM tmp_align_target;--> statement-breakpoint

UPDATE opportunities o
SET current_stage_id = t.to_stage_id,
    updated_at = now()
FROM tmp_align_target t
WHERE t.opportunity_id = o.id;
