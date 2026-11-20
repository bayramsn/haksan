ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS mention_user_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS pinned_at timestamptz;
--> statement-breakpoint
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS forwarded_from_id uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS chat_messages_pinned_idx ON chat_messages (conversation_id, pinned_at) WHERE pinned_at IS NOT NULL AND deleted_at IS NULL;
