import type { OpportunityDetail, ProductModel } from '../../api/endpoints';
import type { EditableQuoteItem } from './quote-logic';

type ProductDetails = ProductModel & { technicalConfiguration?: unknown };
export function quoteOpportunityDefaults(opportunity: Pick<OpportunityDetail, 'title' | 'requestedMachine' | 'products' | 'currency'>, catalog: Record<string, ProductDetails>) {
  const machines = opportunity.products?.filter((machine) => machine.machineName.trim()) ?? [];
  const rows = machines.length ? machines : [{ machineName: opportunity.requestedMachine?.trim() || opportunity.title, quantity: 1, productModelId: null }];
  const primary = rows[0]?.productModelId ? catalog[rows[0].productModelId] : undefined;
  const currencyCode = primary?.currency?.code || opportunity.currency?.code || 'USD';
  const lines = rows.map((machine): Partial<EditableQuoteItem> => {
    const product = machine.productModelId ? catalog[machine.productModelId] : undefined;
    return {
      productModelId: product?.id,
      stockCode: product?.stockCode || product?.modelCode || undefined,
      description: product?.description?.trim() || machine.machineName.trim(),
      quantity: String(Number(machine.quantity) > 0 ? Number(machine.quantity) : 1),
      unitPrice: product?.listPrice != null ? String(Number(product.listPrice)) : '',
      vatRate: product?.vatRate != null ? String(Number(product.vatRate)) : '20',
      categoryCode: product?.category?.code || 'TEZGAH',
      productTypeCode: product?.productType?.code,
      brandId: product?.brand?.id,
      technicalSpecs: (product?.specs ?? []).map((spec) => ({ key: spec.key, value: spec.value, unit: spec.unit ?? undefined })),
      technicalConfiguration: product?.technicalConfiguration ?? null,
    };
  });
  return { currencyCode, lines, productCurrencies: rows.map((machine) => machine.productModelId ? catalog[machine.productModelId]?.currency?.code : undefined) };
}

/** Kullanıcının girdiği kalemler, geç gelen fırsat verisiyle değiştirilmez. */
export function quoteLinesUntouched(items: Pick<EditableQuoteItem, 'productModelId' | 'description' | 'stockCode' | 'unitPrice'>[]): boolean {
  return items.length === 0 || items.every((item) => !item.productModelId && !item.description.trim() && !item.stockCode?.trim() && !item.unitPrice.trim());
}
