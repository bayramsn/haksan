CREATE TABLE IF NOT EXISTS product_create_operations (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operation_id uuid NOT NULL,
  fingerprint varchar(64) NOT NULL,
  scope_fingerprint varchar(64) NOT NULL,
  product_id uuid REFERENCES product_models(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS product_create_operations_owner_unique
  ON product_create_operations(tenant_id, user_id, operation_id);
