/** Canonical web templates, rendered exclusively from an authorized persisted snapshot. */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { printDocumentHtml } from '@haksan/shared';
import { contractDoc, proformaDoc, quoteDoc, type QuotePrintData, type ContractPrintData, type ProformaPrintData } from '@haksan/shared/dist/commercial-print/templates';
import { applyVatRateToNotes, resolveProformaNotes } from '@haksan/shared/dist/commercial-print/notes';
import { snapshotStandardEquipment } from '@haksan/shared/dist/commercial-print/technicalSpecs';
type RecordValue = Record<string, any>;
const n = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const value = (record: RecordValue | null | undefined, ...keys: string[]) => keys.map((key) => record?.[key]).find((v) => v !== undefined && v !== null);
const list = (input: unknown): RecordValue[] => Array.isArray(input) ? input.filter((row) => row && typeof row === 'object') : [];
const date = (input: unknown) => {
  const parsed = new Date(String(input ?? ''));
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
};
const paymentLabels: Record<string, string> = { cash: 'Nakit', bank_transfer: 'Havale / EFT', credit_card: 'Kredi kartı', cheque: 'Çek', check: 'Çek', promissory_note: 'Senet' };
export const commercialPdfFilename = (kind: 'proforma' | 'contract', documentNo: unknown) =>
  `${kind === 'contract' ? 'sozlesme' : 'proforma'}-${String(documentNo ?? 'belge').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 100)}.pdf`;

export function commercialSnapshotPrintData(kind: 'proforma' | 'contract', document: RecordValue, snapshot: RecordValue, options: { variantKey?: string } = {}): ProformaPrintData | ContractPrintData {
  const quote = snapshot.quote ?? {};
  const terms = snapshot.terms ?? {};
  const company = snapshot.company ?? {};
  const contact = snapshot.contact ?? {};
  const currency = String(snapshot.currency?.code ?? 'USD');
  const address = list(snapshot.companyAddresses)[0] ?? {};
  const baseAddress = value(address, 'fullAddress', 'full_address', 'address') ?? '';
  const addressLine = [baseAddress, ...[address.district, address.province ?? address.city, address.country].filter((part) => part && !String(baseAddress).toLocaleLowerCase('tr-TR').includes(String(part).toLocaleLowerCase('tr-TR')))].filter(Boolean).join(', ');
  const items = list(snapshot.items);
  const phone = list(snapshot.companyPhones).find((row) => !/fax/i.test(value(row, 'phoneType', 'phone_type') ?? ''));
  const fax = list(snapshot.companyPhones).find((row) => /fax/i.test(value(row, 'phoneType', 'phone_type') ?? ''));
  const emails = list(snapshot.companyEmails);
  const email = emails.find((row) => value(row, 'isDefault', 'is_default')) ?? emails[0];
  const signature = snapshot.signature;
  const imza = signature?.name ? { ad: String(signature.name), unvan: String(signature.title ?? ''), ...(signature.imageDataUrl ? { gorselUrl: signature.imageDataUrl } : {}) } : undefined;
  const payment = value(terms, 'paymentTermsText', 'payment_terms_text') ?? value(quote, 'paymentTerms', 'payment_terms');
  const delivery = value(terms, 'deliveryTermsText', 'delivery_terms_text') ?? value(quote, 'deliveryTerms', 'delivery_terms');
  const warranty = value(terms, 'warrantyTermsText', 'warranty_terms_text') ?? value(quote, 'warrantyTerms', 'warranty_terms');
  const mainItem = items.find((item) => !String(item.description ?? '').trimStart().startsWith('↳ Opsiyon:')) ?? items[0];
  const vatRate = n(value(mainItem, 'vatRate', 'vat_rate'));
  const lineDiscount = items.reduce((sum, item) => sum + n(value(item, 'discountAmount', 'discount_amount')), 0);
  const headerDiscount = Math.max(n(value(quote, 'discountTotal', 'discount_total')) - lineDiscount, 0);
  // Identical proportional customs allocation as the browser snapshot builder.
  const eligible = items.map((item, index) => item.nationalized ? index : -1).filter((index) => index >= 0);
  const gross = (item: RecordValue) => n(item.quantity) * n(value(item, 'unitPrice', 'unit_price'));
  const eligibleGross = eligible.reduce((sum, index) => sum + Math.max(gross(items[index]), 0), 0);
  const customs = items.map(() => 0);
  let distributed = 0;
  eligible.forEach((index, allocationIndex) => {
    const amount = allocationIndex === eligible.length - 1 ? n(value(quote, 'customsTotal', 'customs_total')) - distributed
      : Math.round(n(value(quote, 'customsTotal', 'customs_total')) * (eligibleGross ? Math.max(gross(items[index]), 0) / eligibleGross : 1 / eligible.length) * 10000) / 10000;
    customs[index] = amount; distributed += amount;
  });
  const buyer = String(value(company, 'legalTitle', 'legal_title', 'shortName', 'short_name') ?? '');
  const fill = (input: unknown) => String(input ?? '').replace(/\{\{ALICI\}\}/g, buyer).replace(/\{\{KDV_ORANI\}\}/g, String(vatRate)).replace(/\{\{YIL\}\}/g, String(new Date(document.signedDate ?? document.issueDate ?? snapshot.capturedAt).getFullYear())).replace(/\{\{[^{}]+\}\}/g, 'belirtilmemiş');
  if (kind === 'proforma') return {
    firma: buyer, ilgili: value(contact, 'fullName', 'full_name'), mobil: value(contact, 'mobilePhone', 'mobile_phone'), adres: addressLine,
    tel: value(contact, 'workPhone', 'work_phone') ?? phone?.phone, faks: fax?.phone, email: email?.email ?? value(contact, 'workEmail', 'work_email', 'email'),
    vergiDairesi: value(company, 'taxOffice', 'tax_office'), vergiNo: value(company, 'taxNumber', 'tax_number'),
    tarih: date(document.issueDate ?? document.createdAt ?? snapshot.capturedAt), belgeNo: document.documentNo,
    items: items.map((item, index) => {
      const product = item.product ?? {};
      const qty = n(item.quantity);
      return { aciklama: String(item.description ?? product.fullName ?? ''), marka: value(product, 'brandName', 'brand_name'), model: value(product, 'modelName', 'model_name'), mensei: value(product, 'originCountry', 'origin_country'), gtip: value(product, 'hsCode', 'hs_code'), birim: `${qty} ${value(item, 'unitCode', 'unit_code') ?? 'Adet'}`, birimFiyati: n(value(item, 'unitPrice', 'unit_price')) + (qty ? customs[index] / qty : 0), iskonto: n(value(item, 'discountAmount', 'discount_amount')), tutar: gross(item) + customs[index] };
    }), headerDiscount, kdvOran: items.every((item) => n(value(item, 'vatRate', 'vat_rate')) === vatRate) ? vatRate : 0, kdvTutar: n(value(quote, 'vatAmount', 'vat_amount')), currency,
    notlar: resolveProformaNotes(options.variantKey, { alici: buyer, kdvOrani: vatRate }) ?? applyVatRateToNotes([payment, delivery, warranty, quote.notes].flatMap((entry) => fill(entry).split(/\r?\n/)).map((entry) => entry.trim()).filter(Boolean), vatRate), imza,
  };
  const net = (item: RecordValue) => Math.max(0, n(value(item, 'lineTotal', 'line_total') ?? gross(item) - n(value(item, 'discountAmount', 'discount_amount'))));
  const beforeHeader = items.reduce((sum, item) => sum + net(item), 0);
  const ratio = beforeHeader > 0 ? Math.max(0, beforeHeader - headerDiscount) / beforeHeader : 1;
  let currentGroup = '';
  const grouped = items.map((item, index) => {
    const option = String(item.description ?? '').trimStart().startsWith('↳ Opsiyon:');
    if (!option) currentGroup = item.compatibility?.lineGroupKey || `legacy-${index}`;
    return { item, index, option, group: item.compatibility?.lineGroupKey || currentGroup };
  });
  const machines = grouped.filter((row) => !row.option).map((row) => {
    const product = row.item.product ?? {};
    const options = grouped.filter((other) => other.option && other.group === row.group);
    const specs = list(row.item.compatibility?.technicalSpecs ?? product.specs).map((spec) => ({ key: String(value(spec, 'key', 'specKey', 'spec_key') ?? ''), value: [value(spec, 'value', 'specValue', 'spec_value'), value(spec, 'unit', 'specUnit', 'spec_unit')].filter(Boolean).join(' ') })).filter((spec) => spec.key && spec.value && !/^[-–—]+$/.test(spec.value));
    const equipment = snapshotStandardEquipment(row.item.compatibility?.technicalSpecs) ?? product.standardEquipment ?? [];
    return { model: String(row.item.description ?? product.fullName ?? ''), adet: n(row.item.quantity) || 1, ozellikler: specs, aksesuarlar: [...equipment, ...options.map((option) => String(option.item.description).replace(/^↳\s*Opsiyon:\s*/, ''))], fiyat: (net(row.item) + options.reduce((sum, option) => sum + net(option.item), 0)) * ratio + customs[row.index] + options.reduce((sum, option) => sum + customs[option.index], 0) };
  });
  const main = machines[0];
  const subtotal = n(value(quote, 'subtotal')) + n(value(quote, 'customsTotal', 'customs_total'));
  const totalMachine = machines.reduce((sum, machine) => sum + machine.fiyat, 0);
  if (machines.length) machines[machines.length - 1].fiyat = Math.max(0, machines[machines.length - 1].fiyat + subtotal - totalMachine);
  const basisText = `${delivery ?? ''} ${payment ?? ''}`.toLocaleLowerCase('tr-TR');
  const deliveryBasis = /millileştiril|millilestiril/.test(basisText) ? 'Millileştirilmiş' : /c\.?\s*i\.?\s*f|cif/.test(basisText) ? 'C.I.F./İstanbul' : /f\.?\s*o\.?\s*b/.test(basisText) ? 'F.O.B.' : /ihracat.*adrese|dap/.test(basisText) ? 'İhracat Adrese Teslim' : /işletme teslim|isletme teslim|ex\s*works/.test(basisText) ? 'İşletme Teslim' : /gümrük|gumruk/.test(basisText) ? 'Gümrük' : undefined;
  return {
    teslimSekli: deliveryBasis,
    alici: { unvan: buyer, kisaUnvan: value(company, 'shortName', 'short_name'), yetkili: value(contact, 'fullName', 'full_name'), adres: addressLine, vergiDairesi: value(company, 'taxOffice', 'tax_office'), vergiNo: value(company, 'taxNumber', 'tax_number'), tel: phone?.phone ?? value(contact, 'workPhone', 'work_phone'), mobil: value(contact, 'mobilePhone', 'mobile_phone'), faks: fax?.phone, eposta: email?.email ?? value(contact, 'workEmail', 'work_email', 'email') },
    sozlesmeNo: document.contractNo, sozlesmeTarihi: String(document.signedDate ?? document.createdAt ?? snapshot.capturedAt),
    model: machines.map((machine) => machine.model).join(' / '), adet: machines.reduce((sum, machine) => sum + machine.adet, 0) || 1,
    ozellikler: main?.ozellikler ?? [], aksesuarlar: main?.aksesuarlar ?? [], machines, fiyat: subtotal, currency,
    teslimGunMin: value(terms, 'estimatedDeliveryDaysMin', 'estimated_delivery_days_min'), teslimGunMax: value(terms, 'estimatedDeliveryDaysMax', 'estimated_delivery_days_max'), teslimYeri: value(terms, 'deliveryLocation', 'delivery_location'),
    teslimKosullari: fill(delivery), odemeKosullari: fill(payment), garantiKosullari: fill(warranty), notlar: fill(quote.notes),
    ithalatMasraflariDahil: value(terms, 'importCostsExcluded', 'import_costs_excluded') === undefined ? undefined : !Boolean(value(terms, 'importCostsExcluded', 'import_costs_excluded')),
    kdvDahil: Boolean(value(terms, 'vatIncluded', 'vat_included')), nakliyeSaticiya: Boolean(value(terms, 'freightPaidBySeller', 'freight_paid_by_seller')), kdvOran: vatRate,
    odemePlani: list(snapshot.receivables).map((row) => ({ label: String(row.notes ?? `Vade ${date(value(row, 'dueDate', 'due_date'))}`), tutar: n(row.amount), senet: value(row, 'paymentMethod', 'payment_method') === 'promissory_note' || /senet/i.test(row.notes ?? ''), yontem: paymentLabels[value(row, 'paymentMethod', 'payment_method')] ?? value(row, 'paymentMethod', 'payment_method') })), imza,
  };
}

/** Inline only fixed, deployment-owned assets. Never read paths supplied by callers. */
export function inlineCommercialPrintAssets(html: string): string {
  const roots = [resolve(process.cwd(), 'apps/web/public/print'), resolve(process.cwd(), '../web/public/print')];
  return html.replace(/src="haksan-print\/(haksan-letterhead\.(?:png|jpg)|haksan-stamp\.png|haxan-product-logo\.webp)"/g, (_match, filename: string) => {
    const path = roots.map((root) => resolve(root, filename)).find(existsSync);
    if (!path) throw new Error(`Belge baskı görseli bulunamadı: ${filename}`);
    return `src="data:image/${filename.endsWith('.jpg') ? 'jpeg' : filename.endsWith('.webp') ? 'webp' : 'png'};base64,${readFileSync(path).toString('base64')}"`;
  });
}
export function commercialDocumentPdfHtml(kind: 'proforma' | 'contract', document: RecordValue, snapshot: RecordValue, options: { variantKey?: string } = {}): string {
  const data = commercialSnapshotPrintData(kind, document, snapshot, options);
  const print = kind === 'proforma' ? proformaDoc(data as ProformaPrintData, 'haksan-print') : contractDoc(data as ContractPrintData, 'haksan-print');
  return inlineCommercialPrintAssets(printDocumentHtml(print));
}


export function quoteSnapshotPrintData(document: RecordValue, snapshot: RecordValue): QuotePrintData {
  const base = commercialSnapshotPrintData('proforma', { ...document, issueDate: document.quoteDate }, snapshot) as ProformaPrintData;
  const quote = snapshot.quote ?? document;
  const terms = snapshot.terms ?? {};
  const owner = snapshot.projectOwner ?? {};
  const items = list(snapshot.items);
  let activeGroup = '';
  const grouped = items.map((item, index) => {
    const option = String(item.description ?? '').trimStart().startsWith('↳ Opsiyon:');
    if (!option) activeGroup = item.compatibility?.lineGroupKey || `legacy-${index}`;
    return { item, option, group: item.compatibility?.lineGroupKey || activeGroup };
  });
  const publicLabel = (item: RecordValue) => {
    let label = String(item.product?.fullName ?? item.description ?? '');
    const code = String(item.stockCode ?? item.product?.stockCode ?? '').trim();
    if (code) label = label.split(code).join('').replace(/^[\s./|:;,_–—-]+|[\s./|:;,_–—-]+$/g, '').replace(/\s{2,}/g, ' ').trim();
    return label || 'Ürün';
  };
  const machines = grouped.filter((row) => !row.option).map((row) => {
    const product = row.item.product ?? {};
    const compatibility = row.item.compatibility ?? {};
    const configuration = compatibility.technicalConfiguration;
    const specs = list(configuration?.specs ?? compatibility.technicalSpecs ?? product.specs).map((spec) => ({ key: String(value(spec, 'key', 'specKey', 'spec_key') ?? ''), value: String(value(spec, 'value', 'specValue', 'spec_value') ?? ''), unit: String(value(spec, 'unit', 'specUnit', 'spec_unit') ?? ''), groupCode: spec.groupCode, groupName: spec.groupName })).filter((spec) => spec.key && spec.value.trim() && !/^[-–—]+$/.test(spec.value.trim()));
    if (configuration?.selection) {
      const selection = configuration.selection;
      const tube = selection.productTypeCode === 'BORU_LAZER_KESIM';
      const keys = new Set(specs.map((spec) => spec.key));
      const identity = [
        { key: 'Ürün Kategorisi', value: 'Tezgah', groupName: 'Ürün' },
        { key: 'Ürün Alt Kategorisi', value: tube ? 'Boru/Profil Lazer Kesim' : 'Sac Lazer Kesim', groupName: 'Ürün' },
        { key: 'Ürün Serisi', value: `${selection.series} Serisi`, groupName: 'Ürün' },
        { key: tube ? 'Kesim Bölgesi Koruması' : 'Kabin Tipi', value: selection.cabinType === 'open' ? 'Açık' : 'Kapalı', groupName: 'Ürün' },
        { key: 'Kaynak Model', value: selection.sourceModelCode, groupName: 'Ürün' },
      ];
      if (!keys.has('Lazer Gücü') && !keys.has('Rezonatör Gücü')) identity.push({ key: 'Rezonatör Gücü', value: `${selection.powerKw} kW`, groupName: 'Ürün' });
      if (tube || (!keys.has('Tabla Boyutu') && !keys.has('Kesme Alanı'))) identity.push({ key: tube ? 'Boru Modeli ve Kapasitesi' : 'Tabla Ölçüsü', value: configuration.sizeLabel, groupName: 'Ürün' });
      specs.unshift(...identity.filter((spec) => !keys.has(spec.key)).map((spec) => ({ ...spec, unit: '', groupCode: undefined })));
    }
    return { lineGroupKey: row.group, urun: publicLabel(row.item), marka: product.brandName, model: product.modelName ?? configuration?.modelLabel, tip: product.productTypeName, imageUrl: product.imageDataUrl, brandLogoUrl: product.brandLogoDataUrl, specs, standartDonanim: snapshotStandardEquipment(compatibility.technicalSpecs) ?? product.standardEquipment ?? [], opsiyonelDonanim: grouped.filter((other) => other.option && other.group === row.group).map((other) => String(other.item.description).replace(/^↳\s*Opsiyon:\s*/, '')) };
  });
  const primary = items.find((item) => !String(item.description ?? '').trimStart().startsWith('↳ Opsiyon:')) ?? items[0];
  const noteVatRate = n(value(primary, 'vatRate', 'vat_rate'));
  const lines = (input: unknown) => applyVatRateToNotes(String(input ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean), noteVatRate);
  const vatRates = items.map((item) => n(value(item, 'vatRate', 'vat_rate')));
  return {
    firma: base.firma, ilgili: base.ilgili, mobil: base.mobil, adres: base.adres, tel: base.tel, faks: base.faks, email: base.email,
    tarih: date(document.quoteDate ?? document.createdAt ?? snapshot.capturedAt), belgeNo: document.documentNo,
    gecerlilik: document.validityDays ? `${document.validityDays} İş Günü` : '',
    projeIlgilisi: owner.name, projeIlgilisiUnvan: owner.title ?? owner.department, projeIlgilisiTelefon: owner.phone, projeIlgilisiEmail: owner.email, imza: base.imza,
    ...machines[0], machines, headerLogo: { mode: 'haksan' },
    items: base.items.map((item, index) => ({ urun: grouped[index]?.option ? String(items[index].description) : publicLabel(items[index]), birim: item.birim, fiyat: item.birimFiyati, indirim: item.iskonto, brutTutar: item.tutar, tutar: item.tutar - n(item.iskonto) })),
    iskonto: base.headerDiscount, kdvOran: vatRates.every((rate) => rate === vatRates[0]) ? vatRates[0] ?? 0 : 0, kdvTutar: base.kdvTutar, currency: base.currency,
    notes: { key: 'entered', label: 'Girilen şartlar', odeme: lines(value(terms, 'paymentTermsText', 'payment_terms_text') ?? quote.paymentTerms), teslimat: lines(value(terms, 'deliveryTermsText', 'delivery_terms_text') ?? quote.deliveryTerms), garanti: lines(value(terms, 'warrantyTermsText', 'warranty_terms_text') ?? quote.warrantyTerms) }, genelNotlar: lines(quote.notes),
  };
}
export function quoteSnapshotPdfHtml(document: RecordValue, snapshot: RecordValue): string {
  return inlineCommercialPrintAssets(printDocumentHtml(quoteDoc(quoteSnapshotPrintData(document, snapshot), 'haksan-print')));
}
