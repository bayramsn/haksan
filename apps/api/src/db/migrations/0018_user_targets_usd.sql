ALTER TABLE "user_targets" ALTER COLUMN "currency" SET DEFAULT 'USD';
UPDATE "user_targets" SET "currency" = 'USD' WHERE "currency" IS DISTINCT FROM 'USD';
