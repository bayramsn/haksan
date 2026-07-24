ALTER TABLE "product_models"
ADD COLUMN IF NOT EXISTS "series" varchar(128);

UPDATE "product_models"
SET "series" = upper((regexp_match("model_code", '^(DL|VM|MV|VC|SL|MT|SJ|TC|HT|LH|D|C)([-0-9 /]|$)', 'i'))[1])
WHERE "series" IS NULL
  AND "model_code" ~* '^(DL|VM|MV|VC|SL|MT|SJ|TC|HT|LH|D|C)([-0-9 /]|$)';
