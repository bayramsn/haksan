ALTER TABLE product_models ADD COLUMN IF NOT EXISTS catalog_hidden boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE product_models ADD COLUMN IF NOT EXISTS laser_base_configuration jsonb;
--> statement-breakpoint
ALTER TABLE product_option_sets ADD COLUMN IF NOT EXISTS configuration_kind varchar(16);
--> statement-breakpoint
ALTER TABLE product_option_values ADD COLUMN IF NOT EXISTS source_model_code varchar(64);
--> statement-breakpoint
ALTER TABLE product_option_values ADD COLUMN IF NOT EXISTS power_kw numeric(5,1);
--> statement-breakpoint
ALTER TABLE product_option_values ADD COLUMN IF NOT EXISTS cabin_type varchar(16);
--> statement-breakpoint
ALTER TABLE product_option_sets ADD CONSTRAINT product_option_configuration_kind_check CHECK (configuration_kind IS NULL OR configuration_kind IN ('table', 'power', 'cabin'));
--> statement-breakpoint
ALTER TABLE product_option_values ADD CONSTRAINT product_option_power_check CHECK (power_kw IS NULL OR power_kw > 0);
--> statement-breakpoint
ALTER TABLE product_option_values ADD CONSTRAINT product_option_cabin_check CHECK (cabin_type IS NULL OR cabin_type IN ('open', 'closed'));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS product_option_configuration_kind_unique ON product_option_sets(product_model_id, configuration_kind) WHERE deleted_at IS NULL AND configuration_kind IS NOT NULL;
