import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { DbClient } from '../client';
import { schema } from '../client';

type SpecRow = { key: string; value: string };

const CNC_TAPPING_CENTER_DEFAULTS: SpecRow[] = [
  { key: 'Tabla Ölçüsü', value: '650 x 420 mm' },
  { key: 'T Slot Ölçü ve Sayısı', value: '14 x 100 x 3' },
  { key: 'Tabla Yükleme Kapasitesi', value: '250 kg' },
  { key: 'Tabla ~ Fener Mili Ucu Arası Mesafe', value: '180 ~ 530 mm' },
  { key: 'X Eksen Hareketi', value: '510 mm' },
  { key: 'Y Eksen Hareketi', value: '420 mm' },
  { key: 'Z Eksen Hareketi', value: '350 mm' },
  { key: 'X Eksen Boşta İlerleme Hızı', value: '48.000 mm/dk' },
  { key: 'Y Eksen Boşta İlerleme Hızı', value: '48.000 mm/dk' },
  { key: 'Z Eksen Boşta İlerleme Hızı', value: '48.000 mm/dk' },
  { key: 'X, Y, Z Eksen Kesme Hızı', value: '20.000 mm/dk' },
  { key: 'X, Y, Z Eksen Pozisyonlama Hassasiyeti', value: '0,017 / 300 mm' },
  { key: 'X, Y, Z Eksen Tekrarlama Hassasiyeti', value: '±0,005 mm' },
  { key: 'Fener Mili Standardı', value: 'BT-30' },
  { key: 'Fener Mili Devri', value: '12.000 dv/dk' },
  { key: 'Fener Mili Aktarması', value: 'Direkt' },
  { key: 'Fener Mili Rulman Tipi', value: 'Çelik' },
  { key: 'Fener Mili Motor Gücü', value: '5,5 kw (7,5 hp)' },
  { key: 'Fener Mili Motor Tipi', value: 'AC Servo' },
  { key: 'X Eksen Motor Gücü', value: '2,2 kw' },
  { key: 'Y Eksen Motor Gücü', value: '2,0 kw' },
  { key: 'Z Eksen Motor Gücü', value: '2,2 kw' },
  { key: 'Soğutma Sistemi Motor Gücü', value: '0,75 kw x 2 Adet' },
  { key: 'Takım Değiştirici Tipi', value: 'Taret Tipi' },
  { key: 'Takım Kapasitesi', value: '21 Adet' },
  { key: 'Maks. Takım Ağırlığı', value: '3 kg' },
  { key: 'Maks. Takım Uzunluğu', value: '200 mm' },
  { key: 'Maks. Takım Çapı', value: 'Ø 100 / Ø 140 mm' },
  { key: 'Takım Değiştirme Süresi (Takımdan Takıma)', value: '1,6 sn' },
  { key: 'Tezgah Hava Gereksinimi', value: '6 bar (100 psi)' },
  { key: 'Toplam Güç Gereksinimi', value: '380 V/ 50 Hz. 12 kw' },
  { key: 'Tezgah Ölçüleri', value: '2.600 x 4.100 x 2.400 mm' },
  { key: 'Tezgahın Kapladığı Alan', value: '-' },
  { key: 'Tezgah Ağırlığı', value: '2.800 kg' },
];

const CNC_BES_EKSEN_DEFAULTS: SpecRow[] = [
  { key: 'Döner Tabla Ölçüsü', value: '' },
  { key: 'T Slot Ölçü ve Sayısı', value: '' },
  { key: 'Tabla Yükleme Kapasitesi', value: '' },
  { key: 'Tabla ~ Fener Mili Ucu Arası Mesafe', value: '' },
  { key: 'X Eksen Hareketi', value: '' },
  { key: 'Y Eksen Hareketi', value: '' },
  { key: 'Z Eksen Hareketi', value: '' },
  { key: 'A Eksen Hareketi', value: '' },
  { key: 'C Eksen Hareketi', value: '' },
  { key: 'X Eksen Boşta İlerleme Hızı', value: '' },
  { key: 'Y Eksen Boşta İlerleme Hızı', value: '' },
  { key: 'Z Eksen Boşta İlerleme Hızı', value: '' },
  { key: 'X, Y, Z Eksen Kesme Hızı', value: '' },
  { key: 'Fener Mili Standardı', value: '' },
  { key: 'Fener Mili Devri', value: '' },
  { key: 'Fener Mili Aktarması', value: '' },
  { key: 'Soğutma Sistemi Motor Gücü', value: '' },
  { key: 'Takım Değiştirici Tipi', value: '' },
  { key: 'Takım Kapasitesi', value: '' },
  { key: 'Maks. Takım Ağırlığı', value: '' },
  { key: 'Maks. Takım Uzunluğu', value: '' },
  { key: 'Maks. Takım Çapı', value: '' },
  { key: 'Tezgah Hava Gereksinimi', value: '' },
  { key: 'Toplam Güç Gereksinimi', value: '' },
  { key: 'Tezgah Ağırlığı', value: '' },
];

const CNC_KOPRU_TIPI_DEFAULTS: SpecRow[] = [
  { key: 'Tabla Ölçüsü', value: '2.000 x 1.100 mm' },
  { key: 'T Slot Ölçü ve Sayısı', value: '22 x 150 x 7' },
  { key: 'Tabla Yükleme Kapasitesi', value: '4.000 kg' },
  { key: 'Kolonlar Arası Mesafe', value: '1.400 mm' },
  { key: 'Tabla ~ Fener Mili Ucu Arası Mesafe', value: '100 ~ 900 mm' },
  { key: 'X Eksen Hareketi', value: '2.100 mm' },
  { key: 'Y Eksen Hareketi', value: '1.200 mm' },
  { key: 'Z Eksen Hareketi', value: '800 mm' },
  { key: 'X Eksen Boşta İlerleme Hızı', value: '12.000 mm/dk' },
  { key: 'Y Eksen Boşta İlerleme Hızı', value: '15.000 mm/dk' },
  { key: 'Z Eksen Boşta İlerleme Hızı', value: '15.000 mm/dk' },
  { key: 'X, Y, Z Eksen Kesme Hızı', value: '10.000 mm/dk' },
  { key: 'X, Y, Z Eksen Pozisyonlama Hassasiyeti', value: '±0,005 / 300 mm' },
  { key: 'X, Y, Z Eksen Tekrarlama Hassasiyeti', value: '±0,003 / 300 mm' },
  { key: 'Fener Mili Standardı', value: 'BT-40' },
  { key: 'Fener Mili Devri', value: '10.000 dv/dk' },
  { key: 'Fener Mili Aktarması', value: 'Direkt Aktarma' },
  { key: 'Fener Mili Rulman Tipi', value: 'Çelik' },
  { key: 'Fener Mili Motor Gücü', value: '15 kw' },
  { key: 'Fener Mili Motor Tipi', value: 'AC Servo' },
  { key: 'X Eksen Motor Gücü', value: '9,0 kw' },
  { key: 'Y Eksen Motor Gücü', value: '4,5 kw' },
  { key: 'Z Eksen Motor Gücü', value: '4,5 kw' },
  { key: 'Soğutma Sistemi Motor Gücü', value: '0,75 kw x 2 Adet' },
  { key: 'Takım Değiştirici Tipi', value: 'Kol Tipi' },
  { key: 'Takım Kapasitesi', value: '24 Adet' },
  { key: 'Maks. Takım Ağırlığı', value: '8 kg' },
  { key: 'Maks. Takım Uzunluğu', value: '300 mm' },
  { key: 'Maks. Takım Çapı', value: 'Ø 125 / Ø 250 mm' },
  { key: 'Takım Değiştirme Süresi (Takımdan Takıma)', value: '6,0 sn' },
  { key: 'Tezgah Hava Gereksinimi', value: '6 bar (100 psi)' },
  { key: 'Toplam Güç Gereksinimi', value: '380 V/ 50 Hz. 30 kw' },
  { key: 'Tezgahın Kapladığı Alan', value: '6.455 x 3.640 x 3.820 mm' },
  { key: 'Tezgah Ağırlığı', value: '15.500 kg' },
];

const DEFAULTS_BY_TYPE: Record<string, SpecRow[]> = {
  CNC_TAPPING_CENTER: CNC_TAPPING_CENTER_DEFAULTS,
  CNC_5_EKSEN_ISLEME_MERKEZI: CNC_BES_EKSEN_DEFAULTS,
  CNC_KOPRU_TIPI_ISLEME_MERKEZI: CNC_KOPRU_TIPI_DEFAULTS,
  KOPRU_TIPI_ISLEME_MERKEZI: CNC_KOPRU_TIPI_DEFAULTS,
};

const FORCE_DEFAULT_TYPES = new Set([
  'CNC_TAPPING_CENTER',
  'CNC_KOPRU_TIPI_ISLEME_MERKEZI',
  'KOPRU_TIPI_ISLEME_MERKEZI',
]);

const normalize = (value: string) => {
  const normalized = value
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const aliases: Record<string, string> = {
    'x y z kesme hizi': 'x y z eksen kesme hizi',
    'pozisyonlama hassasiyeti': 'x y z eksen pozisyonlama hassasiyeti',
    'tekrarlama hassasiyeti': 'x y z eksen tekrarlama hassasiyeti',
    'maksimum takim agirligi': 'maks takim agirligi',
    'maksimum takim uzunlugu': 'maks takim uzunlugu',
    'maksimum takim capi': 'maks takim capi',
    'takim degistirme suresi': 'takim degistirme suresi takimdan takima',
    'hava gereksinimi': 'tezgah hava gereksinimi',
    'kapladigi alan': 'tezgahin kapladigi alan',
    'agirlik': 'tezgah agirligi',
  };
  return aliases[normalized] ?? normalized;
};

const splitTriplet = (value: string, separator: RegExp): string[] => {
  const unit = value.match(/\s([a-zA-ZçğıöşüÇĞİÖŞÜ.\/]+)$/)?.[1] ?? '';
  return value
    .replace(/\s+[a-zA-ZçğıöşüÇĞİÖŞÜ.\/]+$/, '')
    .split(separator)
    .map((part) => `${part.trim()}${unit ? ` ${unit}` : ''}`)
    .filter(Boolean);
};

const pushAxisValues = (target: SpecRow[], keys: readonly string[], values: readonly string[]) => {
  if (values.length === 1) {
    for (const key of keys) target.push({ key, value: values[0] });
    return;
  }
  keys.forEach((key, index) => {
    if (values[index]) target.push({ key, value: values[index] });
  });
};

function expandMachiningCenterSpecs(specs: SpecRow[]): SpecRow[] {
  const expanded: SpecRow[] = [];
  for (const spec of specs) {
    const key = normalize(spec.key);
    if (key === 'x y z eksen hareketi' || key === 'x y ve z eksen hareketi') {
      const [x, y, z] = splitTriplet(spec.value, /\s*[x×]\s*/i);
      pushAxisValues(expanded, ['X Eksen Hareketi', 'Y Eksen Hareketi', 'Z Eksen Hareketi'], [x, y, z].filter(Boolean));
    } else if (
      key === 'x y z eksen bosta ilerleme orani' ||
      key === 'x y z eksen bosta ilerleme hizi' ||
      key === 'x y ve z eksen bosta ilerleme hizi'
    ) {
      const [x, y, z] = splitTriplet(spec.value, /\s*\/\s*/);
      pushAxisValues(expanded, ['X Eksen Boşta İlerleme Hızı', 'Y Eksen Boşta İlerleme Hızı', 'Z Eksen Boşta İlerleme Hızı'], [x, y, z].filter(Boolean));
    } else if (key === 'takim tutucu standardi') {
      const [standard, drive] = spec.value.split(/\s*\/\s*/, 2);
      if (standard) expanded.push({ key: 'Fener Mili Standardı', value: standard.trim() });
      if (drive) expanded.push({ key: 'Fener Mili Aktarması', value: drive.trim() });
    } else if (key === 'takim degistirici') {
      const [type, capacity] = spec.value.split(/\s*-\s*/, 2);
      if (type) expanded.push({ key: 'Takım Değiştirici Tipi', value: type.trim() });
      if (capacity) {
        expanded.push({
          key: 'Takım Kapasitesi',
          value: capacity.replace(/\s*takım kapasiteli$/i, ' Adet').trim(),
        });
      }
    } else {
      expanded.push(spec);
    }
  }
  return expanded;
}

function standardize(typeCode: string, specs: SpecRow[]): SpecRow[] {
  const defaults = DEFAULTS_BY_TYPE[typeCode];
  const source = expandMachiningCenterSpecs(specs);
  const forceDefaults = FORCE_DEFAULT_TYPES.has(typeCode);
  const used = new Set<number>();
  const templateKeys = new Set(defaults.map((defaultSpec) => normalize(defaultSpec.key)));
  const standard = defaults.map((defaultSpec) => {
    const normalized = normalize(defaultSpec.key);
    const index = source.findIndex((spec, specIndex) => !used.has(specIndex) && normalize(spec.key) === normalized);
    if (index < 0) return { key: defaultSpec.key, value: defaultSpec.value || '-' };
    used.add(index);
    if (forceDefaults) return { key: defaultSpec.key, value: defaultSpec.value || '-' };
    const value = source[index].value.trim();
    return { key: defaultSpec.key, value: value && value !== '-' ? source[index].value : defaultSpec.value || '-' };
  });
  const custom = source.filter(
    (spec, index) => !used.has(index) && !templateKeys.has(normalize(spec.key)) && (spec.key.trim() || spec.value.trim()),
  );
  return [...standard, ...custom];
}

export async function up(db: DbClient): Promise<void> {
  const typeCodes = Object.keys(DEFAULTS_BY_TYPE);
  const products = await db
    .select({
      id: schema.productModels.id,
      tenantId: schema.productModels.tenantId,
      typeCode: schema.productTypes.code,
    })
    .from(schema.productModels)
    .innerJoin(schema.productTypes, eq(schema.productModels.productTypeId, schema.productTypes.id))
    .where(and(inArray(schema.productTypes.code, typeCodes), isNull(schema.productModels.deletedAt)));

  const generalGroup = await db.query.productSpecGroups.findFirst({
    where: eq(schema.productSpecGroups.code, 'GENEL'),
  });

  for (const product of products) {
    const existing = await db
      .select({ key: schema.productSpecs.specKey, value: schema.productSpecs.specValue })
      .from(schema.productSpecs)
      .where(and(
        eq(schema.productSpecs.productModelId, product.id),
        isNull(schema.productSpecs.deletedAt),
      ));
    const rows = standardize(product.typeCode, existing);

    await db.delete(schema.productSpecs).where(eq(schema.productSpecs.productModelId, product.id));
    await db.insert(schema.productSpecs).values(rows.map((spec, index) => ({
      tenantId: product.tenantId,
      productModelId: product.id,
      specGroupId: generalGroup?.id ?? null,
      specKey: spec.key,
      specValue: spec.value,
      sortOrder: index,
    })));
  }

  console.log(`[007_standardize_remaining_cnc_specs] standardized ${products.length} product(s).`);
}
