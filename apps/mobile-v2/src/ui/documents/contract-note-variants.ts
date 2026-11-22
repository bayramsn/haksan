import type { TemplateTerms } from './terms-template';
export type ContractNoteVariant = { key: string; label: string; odeme: string[]; teslimat: string[]; garanti: string[] };
export type TermsFillContext = { alici?: string; yil?: string | number; kdvOrani?: string | number; kontrolMarka?: string };
// Mirrored from web print/notes.ts; parity is checked without changing web sources.
export const CONTRACT_NOTE_VARIANTS: ContractNoteVariant[] = [
  {
    key: "cif-istanbul",
    label: "Tezgah CİF İstanbul",
    odeme: [
      "Sözleşmeye konu tezgâh C.I.F./İstanbul teslim şeklinde fiyatlandırılmıştır,",
      "Sözleşme toplam bedelinin tamamı devir sonrası ithalat öncesi peşin tahsil edilecektir,",
    ],
    teslimat: [
      "Tezgâhın teslimi kesin siparişten 90 gün sonra gerçekleştirilecektir,",
      "Tezgâh HAKSAN MAKİNA/Hadımköy antreposundan teslim edilecek olup, tezgâhın karayolu taşıma ve sigortası alıcı firma tarafından karşılanacaktır,",
    ],
    garanti: [
      "Tezgâhın alıcı firmaya teslimini müteakip 2 (iki) gün içerisinde HAKSAN MAKİNA personeli tarafından kurulumu ve ilk çalıştırması gerçekleştirilecektir,",
      "Tezgâhın kurulumunu müteakip eğitim ve demo çalışması HAKSAN MAKİNA tarafından alıcı firma tesislerinde 2 (iki) gün süre ile yapılacaktır,",
      "Tezgâhın mekanik garantisi teslimiyle başlayacak olup, tüm üretim hatalarını kapsayan mekanik garanti süresi 1 (bir) yıldır,",
      "Tezgâhın kontrol ünitesi garantisi teslimiyle başlayacak olup, işletim sistemi garantisi 2 (iki) yıl {{KONTROL_MARKA}}/Türkiye garantisi kapsamındadır,",
      "HAKSAN MAKİNA, alıcı firmaya garanti süresi içerisinde ve sonrasında karşılıklı şartlar dahilinde teknik destek, bilgi, belge, doküman ve yedek parça sağlamakla yükümlüdür.",
    ],
  },
  {
    key: "isletme-teslim",
    label: "İşletme Teslim",
    odeme: [
      "Sözleşmeye konu tezgâh İŞLETME TESLİM şeklinde fiyatlandırılmıştır,",
      "Sözleşme bedeli aşağıda belirtilen ödeme planına göre tahsil edilecektir,",
    ],
    teslimat: [
      "Tezgâhın teslimi sözleşme tarihinden itibaren 90 gün sonra gerçekleştirilecektir,",
      "Tezgâh {{ALICI}} tesislerine teslim edilecek olup, tezgâhın İstanbul şehir içi karayolu taşıma ve sigortası HAKSAN MAKİNA'ya aittir,",
    ],
    garanti: [
      "Tezgâhın alıcı firmaya teslimini müteakip 2 (iki) gün içerisinde HAKSAN MAKİNA personeli tarafından kurulumu ve ilk çalıştırması gerçekleştirilecektir,",
      "Tezgâhın kurulumunu müteakip eğitim ve demo çalışması HAKSAN MAKİNA tarafından alıcı firma tesislerinde 2 (iki) gün süre ile yapılacaktır,",
      "Tezgâhın mekanik garantisi teslimiyle başlayacak olup, tüm üretim hatalarını kapsayan mekanik garanti süresi 1 (bir) yıldır,",
      "Tezgâhın kontrol ünitesi garantisi teslimiyle başlayacak olup, işletim sistemi garantisi 2 (iki) yıl {{KONTROL_MARKA}}/Türkiye garantisi kapsamındadır,",
      "HAKSAN MAKİNA, alıcı firmaya garanti süresi içerisinde ve sonrasında karşılıklı şartlar dahilinde teknik destek, bilgi, belge, doküman ve yedek parça sağlamakla yükümlüdür.",
    ],
  },
];

/** Hazır sözleşmeyle birlikte güncellenen, birbiriyle çelişmemesi gereken ticari yönler. */
export const CONTRACT_NOTE_METADATA: Record<string, {
  importCostsExcluded: boolean;
  vatIncluded: boolean;
  freightPaidBySeller: boolean;
  estimatedDeliveryDaysMin: number;
  estimatedDeliveryDaysMax: number;
}> = {
  "cif-istanbul": {
    importCostsExcluded: true,
    vatIncluded: false,
    freightPaidBySeller: false,
    estimatedDeliveryDaysMin: 90,
    estimatedDeliveryDaysMax: 90,
  },
  "isletme-teslim": {
    importCostsExcluded: false,
    vatIncluded: true,
    freightPaidBySeller: true,
    estimatedDeliveryDaysMin: 90,
    estimatedDeliveryDaysMax: 90,
  },
};


export function fillTerms(value: TemplateTerms, context: TermsFillContext): TemplateTerms {
  const fill = (text: string) => text
    .replace(/\{\{ALICI\}\}/g, () => context.alici?.trim() || 'alıcı firma')
    .replace(/\{\{YIL\}\}/g, () => String(context.yil ?? new Date().getFullYear()))
    .replace(/\{\{KDV_ORANI\}\}/g, () => String(context.kdvOrani ?? 20))
    .replace(/\{\{KONTROL_MARKA\}\}/g, () => context.kontrolMarka?.trim() || 'üretici');
  return { payment: fill(value.payment), delivery: fill(value.delivery), warranty: fill(value.warranty) };
}
export function contractVariantTerms(key: string, context: TermsFillContext) {
  const variant = CONTRACT_NOTE_VARIANTS.find(item => item.key === key);
  return variant ? fillTerms({ payment: variant.odeme.join('\n'), delivery: variant.teslimat.join('\n'), warranty: variant.garanti.join('\n') }, context) : null;
}
export function contractFillContext(input: { buyer?: string | null; date?: string; items?: readonly { description?: string; vatRate?: string | number; compatibility?: { controlUnits?: string[]; technicalSpecs?: { key: string; value: string }[] } | null }[]; warranty?: string | null }): TermsFillContext {
  const items = input.items?.filter(item => !item.description?.trimStart().startsWith('↳ Opsiyon:')) ?? [];
  const specs = items.flatMap(item => item.compatibility?.technicalSpecs ?? []);
  const control = specs.find(spec => /(?:cnc|kontrol)\s*(?:ünite|unite)|kontrol sistemi/i.test(spec.key));
  const brand = `${control?.value ?? ''} ${items.flatMap(item => item.compatibility?.controlUnits ?? []).join(' ')} ${input.warranty ?? ''}`.match(/MITSUBISHI|FANUC|SIEMENS|HEIDENHAIN|SYNTEC/i)?.[0]?.toUpperCase();
  const rate = Number(items[0]?.vatRate ?? 20);
  const year = input.date?.match(/^(\d{4})-/)?.[1];
  return { alici: input.buyer ?? undefined, yil: year ?? new Date().getFullYear(), kdvOrani: Number.isFinite(rate) ? rate : 20, kontrolMarka: brand };
}
