import { machineFamilyForType, machineGroupCode } from '@haksan/shared';

export const haksanGroups = {
  CNC: { name: 'CNC', division: 'CNC', category: 'TEZGAH' },
  UNIVERSAL: { name: 'Üniversal', division: 'UNIVERSAL', category: 'TEZGAH' },
  SAC_ISLEME: { name: 'Sac İşleme', division: 'SAC_ISLEME', category: 'TEZGAH' },
  KAYNAK: { name: 'Kaynak Teknolojileri', division: 'SAC_ISLEME', category: 'KAYNAK' },
  HAVA: { name: 'Hava Üretim Teknolojileri', division: 'SAC_ISLEME', category: 'HAVA' },
  TASIMA: { name: 'Taşıma ve Kaldırma Ekipmanları', division: 'SAC_ISLEME', category: 'TASIMA' },
  AYDINLATMA: { name: 'Endüstriyel Aydınlatma', division: 'SAC_ISLEME', category: 'AKSESUAR' },
  HIRDAVAT: { name: 'Hırdavat ve Makina Ekipmanları', division: 'SAC_ISLEME', category: 'AKSESUAR' },
  YEDEK_PARCA: { name: 'Makina Yedek Parçaları', division: 'SAC_ISLEME', category: 'YEDEK_PARCA' },
} as const;
export type HaksanGroup = keyof typeof haksanGroups;
export interface HaksanSourceProduct { group: HaksanGroup; sourceCategory: string; title: string; brand: string }
export const haksanNormal = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').replace(/İ/g, 'I').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
const cncTypes: Record<string, string> = {
  // Existing CNC type codes that carry the catalog spec templates; CNC gets no new machine types.
  CNC_YATAY_ISLEME_MERKEZLERI: 'CNC_YATAY_ISLEME_MERKEZI',
  CNC_DIK_ISLEME_MERKEZLERI: 'CNC_DIK_ISLEME_MERKEZ',
  CNC_5_EKSEN_ISLEME_MERKEZLERI: 'CNC_5_EKSEN_ISLEME_MERKEZI',
  CNC_KOPRU_TIPI_ISLEME_MERKEZLERI: 'CNC_KOPRU_TIPI_ISLEME_MERKEZI',
  CNC_TORNA_TEZGAHLARI: 'CNC_YATAY_TORNA_TEZGAHI',
  CNC_CIFT_PALETLI_DIK_ISLEME_MERKEZLERI: 'CNC_DIK_ISLEME_MERKEZ',
  CNC_CIFT_KOLONLU_DIK_ISLEME_MERKEZLERI: 'CNC_KOPRU_TIPI_ISLEME_MERKEZI',
  CNC_HIZLI_DELIK_DELME_TEZGAHLARI: 'CNC_TAPPING_CENTER',
  CNC_ELEKTRO_EREZYON_TEZGAHLARI: 'CNC_DALMA_EREZYON',
  CNC_TEL_EREZYON_TEZGAHI: 'CNC_TEL_EREZYON',
};
// These public cards are evidence for the canonical HEX/AORE pipeline, never
// another set of saleable HM-series cards.
export const isCanonicalLaserSource = (product: HaksanSourceProduct) => /^(HEX(?:\s+LASER)?|AORE(?:\s+LASER)?)$/i.test(product.brand.trim())
  && /fiber|lazer|laser/i.test(`${product.title} ${product.sourceCategory}`);
export function haksanTypeCode(product: HaksanSourceProduct): string {
  const category = haksanNormal(product.sourceCategory);
  if (product.group === 'CNC') {
    const type = cncTypes[category];
    if (!type) throw new Error(`CNC kaynak kategorisi eşlenmemiş: ${product.sourceCategory}`);
    return type;
  }
  if (product.group === 'SAC_ISLEME') {
    if (/ABKANT/.test(category)) return 'ABKANT_PRES';
    if (/GIYOTIN/.test(category)) return 'GIYOTIN_MAKAS';
    if (/SILINDIR_KIVIRMA/.test(category)) return 'SILINDIR_MAKINESI';
    if (/PLAZMA/.test(category)) return 'PLAZMA_KESIM';
    // Category, not title: some cards say only "CNC Laser Kesim Makinası".
    if (/LASER|LAZER/.test(category) && /SAC.*BORU/.test(category)) return 'SAC_BORU_LAZER_KESIM';
    if (/LASER|LAZER/.test(category) && /BORU_KESIM/.test(category)) return 'fiber_lazer_boru_kesim';
    if (/LASER|LAZER/.test(category)) return 'fiber_lazer_kesim';
  }
  return `HM_${product.group}_${category}`.slice(0, 64);
}
export function haksanSubcategoryCode(product: HaksanSourceProduct): string {
  const type = haksanTypeCode(product);
  if (machineGroupCode(product.group)) {
    const family = machineFamilyForType(product.group, type);
    if (!family) throw new Error(`Makine ailesi eşlenmemiş: ${product.group}/${type}`);
    return family.code;
  }
  return `HM_${product.group}_${haksanNormal(product.sourceCategory)}`.slice(0, 64);
}

export function haksanExclusion(_product: HaksanSourceProduct): string | null { return null; }
const universalAccessories = new Set(['FREZE_AKSESUARLARI', 'HAREKETLI_SPORT_TABLALAR', 'MANYETIK_MATKAPLAR', 'MATKAP_AKSESUARLARI',
  'MENGENELER', 'TAS_MOTORLARI', 'TORNA_AKSESUARLARI', 'ENDUSTRIYEL_YAGLAMA_SISTEMLERI']);
/** Accessories/spares sit in the division of the machine they fit; CNC ones reach CNC machines only via compatibility rules. */
export function haksanDivision(product: HaksanSourceProduct): string {
  if (product.group !== 'HIRDAVAT' && product.group !== 'YEDEK_PARCA') return haksanGroups[product.group].division;
  const category = haksanNormal(product.sourceCategory);
  if (/\bCNC\b/i.test(product.title) || category === 'CNC_DIVIZOR_DONER_TABLA') return 'CNC';
  if (product.group === 'YEDEK_PARCA' || universalAccessories.has(category)) return 'UNIVERSAL';
  return haksanGroups[product.group].division;
}
