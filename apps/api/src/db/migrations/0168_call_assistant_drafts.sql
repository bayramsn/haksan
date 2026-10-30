CREATE TABLE IF NOT EXISTS call_assistant_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  suggestion_id uuid NOT NULL REFERENCES call_assistant_suggestions(id) ON DELETE CASCADE,
  operation_id uuid NOT NULL,
  kind varchar(32) NOT NULL,
  prefill jsonb,
  status varchar(32) NOT NULL DEFAULT 'pending',
  resource_id uuid,
  resource_type varchar(32),
  commit_operation_id uuid,
  commit_fingerprint varchar(64),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS call_assistant_drafts_operation_unique ON call_assistant_drafts(tenant_id, user_id, operation_id);
