import type { Product } from './mock';

export type SalesPriceFilterField = 'group' | 'category' | 'subcategory' | 'type' | 'brand';
export type SalesPriceFilters = Record<SalesPriceFilterField, string>;
export const emptySalesPriceFilters = (): SalesPriceFilters => ({ group: '', category: '', subcategory: '', type: '', brand: '' });

export function changeSalesPriceFilter(current: SalesPriceFilters, field: SalesPriceFilterField, value: string): SalesPriceFilters {
  const next = { ...current, [field]: value };
  if (field === 'group') next.category = next.subcategory = next.type = '';
  if (field === 'category') next.subcategory = next.type = '';
  if (field === 'subcategory') next.type = '';
  return next;
}

export function salesPriceFilterLabel(product: Product, field: SalesPriceFilterField): string {
  switch (field) {
    case 'group': return product.productGroup || product.productGroupCode || '';
    case 'category': return product.category || product.categoryCode || '';
    case 'subcategory': return product.subcategory || product.subcategoryCode || '';
    case 'type': return product.type || product.productTypeCode || '';
    case 'brand': return product.brand || '';
  }
}

export function salesPriceFilterValue(product: Product, field: SalesPriceFilterField): string {
  const group = product.productGroupCode || product.productGroup || '';
  const category = product.categoryCode || product.category || '';
  const subcategory = product.subcategoryCode || product.subcategory || '';
  switch (field) {
    case 'group': return salesPriceFilterLabel(product, field) ? group : '';
    case 'category': return category ? JSON.stringify([group, category]) : '';
    case 'subcategory': return subcategory ? JSON.stringify([group, category, subcategory]) : '';
    case 'type': return product.productTypeCode || product.type
      ? JSON.stringify([group, category, subcategory, product.productTypeCode || product.type]) : '';
    case 'brand': return product.brand ? product.brandId || product.brand : '';
  }
}

export function salesPriceFilterOptions(products: Product[], field: SalesPriceFilterField) {
  const options = new Map<string, string>();
  for (const product of products) {
    const value = salesPriceFilterValue(product, field);
    if (value) options.set(value, salesPriceFilterLabel(product, field));
  }
  return [...options].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, 'tr', { numeric: true }));
}

const searchText = (value: string) => value.toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');
export function filterSalesPrices(products: Product[], filters: Partial<SalesPriceFilters>, query = '') {
  const terms = searchText(query.trim()).split(/\s+/).filter(Boolean);
  return products.filter(product => Object.entries(filters).every(([field, value]) => !value || salesPriceFilterValue(product, field as SalesPriceFilterField) === value)
    && terms.every(term => searchText([product.brand, product.series, product.model, product.modelName, product.type,
      product.shortDescription, product.stockCode, product.productGroup, product.category, product.subcategory].filter(Boolean).join(' ')).includes(term)));
}
