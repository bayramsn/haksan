/** Validate calendar dates before Date can silently roll them into another month. */
export function maintenancePlanInput(intervalText: string, dueText: string): { intervalDays: number; nextDueDate?: string } {
  const intervalDays = Number(intervalText.trim() || '180');
  if (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 3650) throw new Error('Periyot 1–3650 gün arasında olmalıdır.');
  const value = dueText.trim();
  if (!value) return { intervalDays };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Geçerli bir bakım tarihi seçin.');
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) throw new Error('Geçerli bir bakım tarihi seçin.');
  return { intervalDays, nextDueDate: date.toISOString() };
}
