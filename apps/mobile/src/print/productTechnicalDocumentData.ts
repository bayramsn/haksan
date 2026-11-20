import { printDocumentHtml } from '@haksan/shared';
import type { Product } from '../../../web/src/app/lib/mock';
import { productTechnicalDoc } from '../../../web/src/app/lib/print/productTechnicalPrint';
import { printMediaUrl } from './printMediaUrl';

/** API detail/spec rows have nested objects; preserve the CRM group codes and labels. */
export function productForPrint(raw: Record<string, any>, specRows: any[], origin: string): Product {
  const source = raw.technicalConfiguration?.specs ?? (specRows.length ? specRows : raw.specs ?? []);
  const specs = source.map((row: any) => {
    const spec = row.spec ?? row;
    return {
      key: String(spec.key ?? spec.specKey ?? ''), value: String(spec.value ?? spec.specValue ?? ''),
      unit: String(spec.unit ?? spec.specUnit ?? ''),
      groupCode: String(row.group?.code ?? spec.groupCode ?? spec.specGroupCode ?? ''),
      groupName: String(row.group?.name ?? spec.groupName ?? spec.group ?? ''),
    };
  }).filter((spec: { key: string }) => spec.key.trim());
  return {
    id: raw.id, brand: raw.brand?.name ?? '', brandLogoUrl: printMediaUrl(raw.brand?.logoUrl, origin),
    series: raw.series ?? '', model: raw.modelCode ?? '', modelName: raw.modelName ?? '',
    type: raw.productType?.name ?? '', productTypeCode: raw.productType?.code ?? '',
    productGroup: raw.productGroup?.name ?? '', productGroupCode: raw.productGroup?.code ?? '',
    category: raw.category?.name ?? '', categoryCode: raw.category?.code ?? '',
    controlPanel: specs.find((spec: { key: string }) => /kontrol\s*(ünitesi|unitesi|paneli)|cnc\s*kontrol/i.test(spec.key))?.value ?? '',
    imageUrl: printMediaUrl(raw.imageUrl, origin), shortDescription: raw.fullName ?? '', description: raw.description ?? '',
    currency: raw.currency?.code ?? 'USD', stockCode: raw.stockCode ?? '',
    technicalConfiguration: raw.technicalConfiguration, originCountry: raw.originCountry, hsCode: raw.hsCode,
    specs, standardEquipment: raw.standardEquipment ?? [], optionalEquipment: raw.optionalEquipment ?? [],
    status: raw.isActive ? 'active' : 'passive',
  };
}

export function productTechnicalHtml(raw: Record<string, any>, specRows: any[], equipment: any[], compatible: any[], origin: string): string {
  if (!raw.id || (!raw.fullName && !raw.modelCode && !raw.modelName)) throw new Error('Ürün bilgileri bulunamadı.');
  const product = productForPrint(raw, specRows, origin);
  const standard = equipment.filter((row) => row.type?.code !== 'opsiyonel').map((row) => row.item.title);
  const optional = equipment.filter((row) => row.type?.code === 'opsiyonel').map((row) => ({ id: row.item.id, title: row.item.title }));
  if (product.categoryCode === 'TEZGAH') {
    optional.push(...compatible.filter((row) => row.product?.id).map((row) => ({
      id: row.product.id,
      title: [row.brand?.name, row.product.fullName || row.product.modelCode].filter(Boolean).join(' ') || 'Opsiyonel donanım',
    })));
    optional.push(...(raw.muadilProducts ?? []).filter((row: any) => row.category?.code === 'OPSIYONEL_DONANIM').map((row: any) => ({
      id: row.id, title: [row.brand?.name, row.modelCode].filter(Boolean).join(' ') || row.fullName || 'Opsiyonel donanım',
    })));
  }
  return printDocumentHtml(productTechnicalDoc({
    product, standardEquipment: standard.length ? standard : product.standardEquipment,
    optionalEquipment: optional.filter((row, index, all) => all.findIndex((candidate) => candidate.id === row.id) === index),
  }, `${origin}/print`));
}
