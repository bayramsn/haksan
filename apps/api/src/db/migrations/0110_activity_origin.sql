ALTER TABLE "sales_activities"
  ADD COLUMN IF NOT EXISTS "origin" varchar(16) DEFAULT 'manual' NOT NULL;
--> statement-breakpoint
UPDATE "sales_activities"
SET "origin" = 'system'
WHERE "origin" = 'manual'
  AND (
    "subject" = 'Teklif oluşturuldu'
    OR "subject" ILIKE '% teklif takibi — %'
  );
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "pg_constraint"
    WHERE "conname" = 'sales_activities_origin_check'
      AND "conrelid" = 'sales_activities'::regclass
  ) THEN
    ALTER TABLE "sales_activities"
      ADD CONSTRAINT "sales_activities_origin_check"
      CHECK ("origin" IN ('manual', 'system'));
  END IF;
END
$$;
