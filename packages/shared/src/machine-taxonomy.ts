/** Stable machine families shared by imports, forms and the data migration.
 * Detailed type codes are retained. Unknown codes must be explicitly mapped,
 * never guessed from the product name during a data migration.
 */
export type MachineGroupCode = 'CNC' | 'UNIVERSAL' | 'SAC_ISLEME';
export type MachineFamily = { code: string; label: string };
export const MACHINE_FAMILIES: Record<MachineGroupCode, readonly MachineFamily[]> = {
  CNC: [
    { code: 'ISLEME_MERKEZI', label: 'İşleme Merkezi' }, { code: 'TORNA', label: 'Torna' },
    { code: 'TASLAMA', label: 'Taşlama' }, { code: 'EDM', label: 'EDM' },
  ],
  UNIVERSAL: [
    { code: 'TORNA', label: 'Torna' }, { code: 'FREZE', label: 'Freze' },
    { code: 'MATKAP', label: 'Matkap' }, { code: 'TASLAMA', label: 'Taşlama' },
    { code: 'TESTERE', label: 'Testere' }, { code: 'PRES', label: 'Pres' },
    { code: 'PLANYA', label: 'Planya' }, { code: 'EDM', label: 'EDM' },
  ],
  SAC_ISLEME: [
    { code: 'SAC_BUKME', label: 'Bükme' }, { code: 'SAC_KESME', label: 'Kesme' },
    { code: 'SAC_LAZER_KESIM', label: 'Lazer Kesim' }, { code: 'SAC_PRES', label: 'Pres' },
    { code: 'SAC_SEKILLENDIRME', label: 'Şekillendirme' },
  ],
};

export const machineTaxonomyCode = (value: string) => value.normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').replace(/İ/g, 'I')
  .toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');

export function machineGroupCode(value?: string | null): MachineGroupCode | undefined {
  const code = machineTaxonomyCode(value ?? '');
  return code === 'CNC' || code === 'UNIVERSAL' || code === 'SAC_ISLEME' ? code : undefined;
}

export function machineCategoryLabel(group?: string | null): string {
  const code = machineGroupCode(group);
  return code ? ({ CNC: 'CNC Tezgahları', UNIVERSAL: 'Üniversal Tezgahlar', SAC_ISLEME: 'Sac İşleme Tezgahları' })[code] : 'Tezgah';
}

/** Audited main category aliases. HM_KAYNAK/HAVA/TASIMA_TEZGAH are separate catalogs. */
export function isMainMachineCategory(code?: string | null): boolean {
  return ['TEZGAH', 'CNC_TEZGAH', 'UNIVERSAL_TEZGAH', 'SAC_ISLEME_TEZGAH',
    'CNC_MACHINE', 'UNIVERSAL_MACHINE', 'SAC_MACHINE'].includes(machineTaxonomyCode(code ?? ''));
}

const mappings: Record<MachineGroupCode, Record<string, string>> = { CNC: {}, UNIVERSAL: {}, SAC_ISLEME: {} };
function add(group: MachineGroupCode, family: string, codes: string[]) {
  for (const code of codes) mappings[group][machineTaxonomyCode(code)] = family;
}
function sourceTypes(group: MachineGroupCode, family: string, names: string[]) {
  add(group, family, names.map((name) => `HM_${group}_${machineTaxonomyCode(name)}`.slice(0, 64)));
}
add('CNC', 'ISLEME_MERKEZI', ['DIK_ISLEME_MERKEZI', 'KOPRU_TIPI_ISLEME_MERKEZI', 'CNC_DIK_ISLEME_MERKEZ', 'CNC_DIK_ISLEME_MERKEZI', 'CNC_YATAY_ISLEME_MERKEZI', 'CNC_KOPRU_TIPI_ISLEME_MERKEZI', 'CNC_5_EKSEN_ISLEME_MERKEZI', 'CNC_TAPPING_CENTER']);
add('CNC', 'TORNA', ['CNC_TORNA', 'CNC_YATAY_TORNA_TEZGAHI', 'CNC_DIK_TORNA_TEZGAHI', 'CNC_C_EKSENLI_YATAY_TORNA_TEZGAHI', 'CNC_C_Y_EKSENLI_YATAY_TORNA_TEZGAHI']);
add('CNC', 'TASLAMA', ['CNC_TASLAMA', 'CNC_TASLAMA_TEZGAHI']);
add('CNC', 'EDM', ['CNC_EDM', 'CNC_TEL_EREZYON', 'CNC_DALMA_EREZYON']);
add('UNIVERSAL', 'TORNA', ['UNIVERSAL_TORNA']);
add('UNIVERSAL', 'FREZE', ['UNIVERSAL_FREZE']);
add('UNIVERSAL', 'MATKAP', ['RADYAL_MATKAP']);
add('UNIVERSAL', 'TASLAMA', ['SATIH_TASLAMA']);
sourceTypes('UNIVERSAL', 'TORNA', ['Üniversal Torna Tezgahları', 'Masaüstü Torna Tezgahları', 'Rovelver Tezgahları']);
sourceTypes('UNIVERSAL', 'FREZE', ['Üniversal Freze Tezgahları', 'Kalıpçı Freze Tezgahları', 'Matkap Freze Tezgahları']);
sourceTypes('UNIVERSAL', 'MATKAP', ['Masaüstü Matkap Tezgahları', 'Radyal Matkap Tezgahları', 'Sütunlu Matkap Tezgahları', 'Şanzımanlı Matkap Tezgahları', 'Kılavuz Çekme Makinaları']);
sourceTypes('UNIVERSAL', 'TASLAMA', ['Alet Bileme Makinaları', 'Satıh Taşlama Tezgahları', 'Döner Tablalı Satıh Taşlama Tezgahları', 'Zımpara Makinaları']);
sourceTypes('UNIVERSAL', 'TESTERE', ['Şerit Testere Tezgahları (Mafsallı)', 'Şerit Testere Tezgahları (Sütunlu)']);
sourceTypes('UNIVERSAL', 'PRES', ['H Tipi Hidrolik Atölye Presleri']);
sourceTypes('UNIVERSAL', 'PLANYA', ['Dik Planya Tezgahları']);
sourceTypes('UNIVERSAL', 'EDM', ['Elektro Erezyon Tezgahları', 'Delik Delme Erezyon Tezgahları']);
add('SAC_ISLEME', 'SAC_BUKME', ['ABKANT_PRES', 'SILINDIR_MAKINESI']);
add('SAC_ISLEME', 'SAC_KESME', ['GIYOTIN_MAKAS', 'PLAZMA_KESIM']);
add('SAC_ISLEME', 'SAC_LAZER_KESIM', ['FIBER_LAZER_KESIM', 'FIBER_LAZER_BORU_KESIM', 'BORU_LAZER_KESIM', 'SAC_BORU_LAZER_KESIM']);
sourceTypes('SAC_ISLEME', 'SAC_BUKME', ['Abkant Presler- NC Serisi', 'Boru & Profil Bükme Makinaları', 'Silindir Kıvırma Makinaları']);
sourceTypes('SAC_ISLEME', 'SAC_KESME', ['Daire Kesme Makinaları', 'Daire Testere Tezgahları', 'Hidrolik Giyotin Makaslar', 'Hidrolik Köşe Kesme Makinası', 'Kollu Manuel Giyotin Makaslar', 'Kombine Makaslar', 'Kurtağzı Açma Makinaları', 'Motorlu Giyotin Makaslar']);
sourceTypes('SAC_ISLEME', 'SAC_PRES', ['Eksantrik Presler', 'CNC Panç Pres Makinaları']);
sourceTypes('SAC_ISLEME', 'SAC_SEKILLENDIRME', ['Caka Kenet Makinaları', 'Kordon Makinaları']);

export function machineFamilyForType(group: string, typeCode: string): MachineFamily | undefined {
  const key = machineGroupCode(group);
  if (!key) return undefined;
  const code = mappings[key][machineTaxonomyCode(typeCode)];
  return MACHINE_FAMILIES[key].find((family) => family.code === code);
}

/** Legacy welding/cleaning machines keep their existing taxonomy outside consolidation. */
export function isExcludedMachineType(code: string): boolean {
  return ['FIBER_LAZER_KAYNAK', 'LAZER_TEMIZLEME'].includes(machineTaxonomyCode(code));
}
