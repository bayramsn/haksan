-- Fail without changing existing devices if duplicate active stock links exist.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM customer_devices WHERE inventory_item_id IS NOT NULL AND deleted_at IS NULL GROUP BY tenant_id, inventory_item_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Duplicate active inventory-linked devices; review preflight report before migration';
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS customer_devices_active_inventory_unique
ON customer_devices (tenant_id, inventory_item_id)
WHERE inventory_item_id IS NOT NULL AND deleted_at IS NULL;
