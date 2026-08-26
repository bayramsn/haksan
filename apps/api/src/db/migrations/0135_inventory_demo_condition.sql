-- Demo makineler stokta ayrı bir kondisyon olarak izlenir; kontrol kısıtı
-- yalnız 'new'/'used' kabul ettiği için demo kayıt yazılamıyordu.
ALTER TABLE "inventory_items" DROP CONSTRAINT IF EXISTS "inventory_items_item_condition_check";
--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_item_condition_check"
CHECK ("item_condition" IN ('new', 'used', 'demo'));
