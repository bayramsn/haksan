-- 0092'nin ilk sürümü, kartın mevcut aşaması zaten hedef derecenin alanında
-- olduğunda da onu giriş aşamasına çekiyordu: B/"Ziyaret" kartları B'nin giriş
-- aşaması olan "Arama"ya geri gitti. 0092 düzeltildi; bu migration ise o sürümü
-- çalıştırmış veritabanlarındaki geri gidişi onarır.
--
-- Yeni kurulan veritabanlarında 0092 zaten doğru davrandığı için burada
-- eşleşen kayıt bulunmaz ve migration sessizce geçer.

WITH regressed AS (
  SELECT DISTINCT ON (h.opportunity_id)
    h.opportunity_id,
    h.tenant_id,
    h.from_stage_id AS restore_stage_id,
    h.to_stage_id AS wrong_stage_id
  FROM opportunity_stage_history h
  JOIN pipeline_stages pf ON pf.id = h.from_stage_id
  JOIN pipeline_stages pt ON pt.id = h.to_stage_id
  WHERE h.change_reason = 'Derece ile hizalama (0092)'
    -- Yalnız aynı alan içinde geriye gidenler: her ikisi de B alanına ait.
    AND pf.code IN ('visit') AND pt.code IN ('call')
  ORDER BY h.opportunity_id, h.created_at DESC
),
still_wrong AS (
  SELECT r.*
  FROM regressed r
  JOIN opportunities o ON o.id = r.opportunity_id
  WHERE o.deleted_at IS NULL
    -- Kart hatalı taşınmadan sonra elle oynatıldıysa dokunma.
    AND o.current_stage_id = r.wrong_stage_id
)
INSERT INTO opportunity_stage_history (tenant_id, opportunity_id, from_stage_id, to_stage_id, changed_by, change_reason)
SELECT tenant_id, opportunity_id, wrong_stage_id, restore_stage_id, NULL, 'Hizalama geri alma (0093)'
FROM still_wrong;--> statement-breakpoint

WITH regressed AS (
  SELECT DISTINCT ON (h.opportunity_id)
    h.opportunity_id,
    h.from_stage_id AS restore_stage_id,
    h.to_stage_id AS wrong_stage_id
  FROM opportunity_stage_history h
  JOIN pipeline_stages pf ON pf.id = h.from_stage_id
  JOIN pipeline_stages pt ON pt.id = h.to_stage_id
  WHERE h.change_reason = 'Derece ile hizalama (0092)'
    AND pf.code IN ('visit') AND pt.code IN ('call')
  ORDER BY h.opportunity_id, h.created_at DESC
)
UPDATE opportunities o
SET current_stage_id = r.restore_stage_id,
    updated_at = now()
FROM regressed r
WHERE o.id = r.opportunity_id
  AND o.deleted_at IS NULL
  AND o.current_stage_id = r.wrong_stage_id;
