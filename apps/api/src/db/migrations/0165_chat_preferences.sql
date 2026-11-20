ALTER TABLE "conversation_members"
  ADD COLUMN "is_favorite" boolean DEFAULT false NOT NULL,
  ADD COLUMN "is_muted" boolean DEFAULT false NOT NULL;
