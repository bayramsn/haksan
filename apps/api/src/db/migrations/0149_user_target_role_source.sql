-- Rol toplu hedeflerini kişisel hedeflerden ayırır. Nullable/metadata-only alan,
-- mevcut satırların anlamını değiştirmez ve expand-contract için güvenlidir.
ALTER TABLE "user_targets"
  ADD COLUMN IF NOT EXISTS "source_role_id" uuid;
