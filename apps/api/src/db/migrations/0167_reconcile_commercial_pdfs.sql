-- Reconcile databases whose migration ledger advanced without the PDF artifact table.
CREATE TABLE IF NOT EXISTS commercial_pdfs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES tenants(id),
 kind varchar(16) NOT NULL CHECK (kind IN ('quote','proforma','contract')),
 document_id uuid NOT NULL,
 source_hash varchar(64) NOT NULL,
 template_version varchar(32) NOT NULL,
 file_id uuid NOT NULL REFERENCES files(id) ON DELETE RESTRICT,
 snapshot jsonb NOT NULL,
 generated_by uuid NOT NULL REFERENCES users(id),
 selected_at timestamptz NOT NULL DEFAULT now(),
 generated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS commercial_pdfs_version_unique ON commercial_pdfs(tenant_id,kind,document_id,source_hash,template_version);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS commercial_pdfs_document_idx ON commercial_pdfs(tenant_id,kind,document_id,generated_at);
