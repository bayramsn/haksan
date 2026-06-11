ALTER TABLE "product_models" ADD COLUMN IF NOT EXISTS "muadil_product_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_models" ADD CONSTRAINT "product_models_muadil_product_id_product_models_id_fk" FOREIGN KEY ("muadil_product_id") REFERENCES "public"."product_models"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
