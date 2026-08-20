/** Ticari belgelerde otomatik onay eşiği. Tam %10 onay gerektirmez; üzeri gerektirir. */
export const DISCOUNT_APPROVAL_THRESHOLD_PERCENT = 10;

const MONEY_EPSILON = 0.0001;

export function discountPercent(grossAmount: number, discountAmount: number): number {
  if (!Number.isFinite(grossAmount) || grossAmount <= 0) return 0;
  if (!Number.isFinite(discountAmount) || discountAmount <= 0) return 0;
  return (Math.min(discountAmount, grossAmount) / grossAmount) * 100;
}

export function requiresDiscountApproval(
  grossAmount: number,
  discountAmount: number,
  thresholdPercent = DISCOUNT_APPROVAL_THRESHOLD_PERCENT,
): boolean {
  return discountPercent(grossAmount, discountAmount) > thresholdPercent + MONEY_EPSILON;
}

export function referencePriceDiscountPercent(referencePrice: number, netPrice: number): number {
  if (!Number.isFinite(referencePrice) || referencePrice <= 0) return 0;
  if (!Number.isFinite(netPrice)) return 0;
  return discountPercent(referencePrice, Math.max(referencePrice - netPrice, 0));
}

export function requiresReferencePriceApproval(
  referencePrice: number,
  netPrice: number,
  thresholdPercent = DISCOUNT_APPROVAL_THRESHOLD_PERCENT,
): boolean {
  return referencePriceDiscountPercent(referencePrice, netPrice) > thresholdPercent + MONEY_EPSILON;
}
