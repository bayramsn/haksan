ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "latitude" double precision;
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "longitude" double precision;
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "location_label" varchar(255);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chat_messages_location_pair_check'
  ) THEN
    ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_location_pair_check"
    CHECK (
      ("latitude" IS NULL AND "longitude" IS NULL)
      OR
      ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180)
    );
  END IF;
END $$;
