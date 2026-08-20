export function selectedRecordById<T extends { id: string }>(
  records: readonly T[],
  selectedId: string | null,
): T | null {
  if (!selectedId) return null;
  return records.find((record) => record.id === selectedId) ?? null;
}
