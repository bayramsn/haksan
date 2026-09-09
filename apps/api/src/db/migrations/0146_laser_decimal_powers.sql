ALTER TABLE "laser_technical_profiles" DROP CONSTRAINT IF EXISTS "laser_technical_profiles_power_kw_check";
--> statement-breakpoint
ALTER TABLE "laser_technical_profiles" ALTER COLUMN "power_kw" TYPE numeric(5,1) USING "power_kw"::numeric(5,1);
--> statement-breakpoint
ALTER TABLE "laser_technical_profiles" ADD CONSTRAINT "laser_technical_profiles_power_kw_check" CHECK ("power_kw" IN (1.5, 2, 3, 6, 12, 20, 30));
