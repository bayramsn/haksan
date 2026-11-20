/**
 * Saklanan gümrük toplamını belge satırlarına dağıtır. CRM fiyatlarını değiştirmez;
 * yalnızca PDF için üretilen birim fiyat ve tutarlara eklenecek payları döndürür.
 */
export const allocateCustomsTotal = <T,>(
  rows: T[],
  customsTotal: number,
  isEligible: (row: T) => boolean,
  grossOf: (row: T) => number,
): number[] => {
  const allocations = rows.map(() => 0);
  const total = Number.isFinite(customsTotal) ? Math.max(0, customsTotal) : 0;
  if (total <= 0) return allocations;

  const eligibleIndexes = rows
    .map((row, index) => (isEligible(row) ? index : -1))
    .filter((index) => index >= 0);
  if (!eligibleIndexes.length) return allocations;

  const grossTotal = eligibleIndexes.reduce(
    (sum, index) => sum + Math.max(0, grossOf(rows[index])),
    0,
  );
  let distributed = 0;
  eligibleIndexes.forEach((index, eligibleIndex) => {
    const isLast = eligibleIndex === eligibleIndexes.length - 1;
    const weight = grossTotal > 0
      ? Math.max(0, grossOf(rows[index])) / grossTotal
      : 1 / eligibleIndexes.length;
    const allocation = isLast
      ? total - distributed
      : Math.round(total * weight * 10_000) / 10_000;
    allocations[index] = allocation;
    distributed += allocation;
  });
  return allocations;
};

