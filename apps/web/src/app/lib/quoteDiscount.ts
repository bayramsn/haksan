export type ProductDiscountType = "percent" | "amount";

export type ProductDiscountInput = {
  quantity: number;
  unitPrice: number;
  discountValue: number;
  discountType: ProductDiscountType;
};

export function calculateProductDiscountAmount(input: ProductDiscountInput): number {
  const gross = Math.max(0, input.quantity * input.unitPrice);
  const entered = Math.max(0, input.discountValue);
  return input.discountType === "percent"
    ? Math.min(gross, gross * Math.min(entered, 100) / 100)
    : Math.min(gross, entered);
}

export function isProductDiscountValid(input: ProductDiscountInput): boolean {
  if (![input.quantity, input.unitPrice, input.discountValue].every(Number.isFinite)) return false;
  if (input.quantity <= 0 || input.unitPrice < 0 || input.discountValue < 0) return false;
  return input.discountType === "percent"
    ? input.discountValue <= 100
    : input.discountValue <= input.quantity * input.unitPrice;
}
