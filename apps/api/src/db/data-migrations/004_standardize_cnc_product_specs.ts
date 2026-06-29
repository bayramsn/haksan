import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { DbClient } from '../client';
import { schema } from '../client';

type SpecRow = { key: string; value: string };

const CNC_DIK_ISLEME_TEMPLATE = [
  'Tabla Ölçüsü', 'T Slot Ölçü ve Sayısı', 'Tabla Yükleme Kapasitesi',
  'Tabla ~ Fener Mili Ucu Arası Mesafe', 'X Eksen Hareketi', 'Y Eksen Hareketi',
  'Z Eksen Hareketi', 'X Eksen Boşta İlerleme Hızı', 'Y Eksen Boşta İlerleme Hızı',
  'Z Eksen Boşta İlerleme Hızı', 'X, Y, Z Eksen Kesme Hızı',
  'X, Y, Z Eksen Pozisyonlama Hassasiyeti', 'X, Y, Z Eksen Tekrarlama Hassasiyeti',
  'Fener Mili Standardı', 'Fener Mili Devri', 'Fener Mili Aktarması', 'Fener Mili Rulman Tipi',
  'Fener Mili Motor Gücü', 'Fener Mili Motor Tipi', 'X Eksen Motor Gücü', 'Y Eksen Motor Gücü',
  'Z Eksen Motor Gücü', 'Soğutma Sistemi Motor Gücü', 'Takım Değiştirici Tipi',
  'Takım Kapasitesi', 'Maks. Takım Ağırlığı', 'Maks. Takım Uzunluğu', 'Maks. Takım Çapı',
  'Takım Değiştirme Süresi (Takımdan Takıma)', 'Tezgah Hava Gereksinimi',
  'Toplam Güç Gereksinimi', 'Tezgah Ölçüleri', 'Tezgahın Kapladığı Alan', 'Tezgah Ağırlığı',
] as const;

const TEMPLATES: Record<string, readonly string[]> = {
  CNC_YATAY_TORNA_TEZGAHI: [
    'Ayna Ölçüsü', 'Maks. Çevirme Kapasitesi', 'Maks. Tornalama Çapı', 'Maks. Tornalama Boyu',
    'Maks. Çubuk İşleme Çapı', 'Fener Mili Devri', 'Fener Mili Motor Gücü', 'Fener Mili Standardı',
    'Fener Mili Delik Çapı', 'Fener Mili Ön Rulman Çapı', 'Karşı Punta Pinol Çapı',
    'Karşı Punta Pinol Hareketi', 'Karşı Punta Pinol Koniği', 'Karşı Punta Gövde Hareketi',
    'Karşı Ayna Ölçüsü', 'Karşı Ayna Çubuk İşleme Çapı', 'Karşı Ayna Devri', 'Karşı Ayna Motor Gücü',
    'Canlı Takım Devri', 'Canlı Takım Motor Gücü', 'Bağlanabilir Canlı Takım Sayısı',
    'Canlı Takım Tutucu Standardı', 'X Eksen Hareketi', 'Z Eksen Hareketi', 'Y Eksen Hareketi',
    'Z-2 Eksen Hareketi', 'X Eksen Boşta İlerleme Oranı', 'Z Eksen Boşta İlerleme Oranı',
    'Y Eksen Boşta İlerleme Oranı', 'Z-2 Eksen Boşta İlerleme Oranı', 'X Eksen Motor Gücü',
    'Z Eksen Motor Gücü', 'Y Eksen Motor Gücü', 'Z-2 Eksen Motor Gücü', 'Taret Tipi',
    'Taret İstasyon Sayısı', 'Maks. Kare Takım Ölçüsü', 'Maks. Yuvarlak Takım Ölçüsü',
    'Toplam Güç Gereksinimi', 'Toplam Hava Gereksinimi', 'Soğutma Sıvısı Tank Kapasitesi',
    'Tezgahın Kapladığı Alan', 'Tezgah Ağırlığı',
  ],
  CNC_DIK_TORNA_TEZGAHI: [
    'Tabla (Ayna) Çapı', 'Maks. Çevirme Kapasitesi', 'Maks. Tornalama Çapı', 'Maks. Tornalama Boyu',
    'Maks. İş Parçası Ağırlığı', 'Tabla (Fener Mili) Motor Gücü',
    'Tabla C Eksen İndeksleme Motor Gücü', 'Tabla (Fener Mili) Devir Aralığı',
    'Fener Mili Delik Standardı', 'Taret Tipi', 'İstasyon Sayısı', 'Maks. Takım Uzunluğu',
    'Maks. Kare Takım Çapı', 'Maks. Yuvarlak Takım Çapı', 'Canlı Takım Motor Gücü',
    'Canlı Takım Devri', 'Bağlanabilir Canlı Takım Sayısı', 'Canlı Takım Tutucu Standardı',
    'X Eksen Hareketi', 'Z Eksen Hareketi', 'W Eksen Hareketi',
    'X Eksen Boşta İlerleme Oranı', 'Z Eksen Boşta İlerleme Oranı', 'X Eksen Motor Gücü',
    'Z Eksen Motor Gücü', 'Toplam Güç Gereksinimi', 'Toplam Hava Gereksinimi',
    'Soğutma Sıvısı Tank Kapasitesi', 'Tezgah Ölçüleri', 'Tezgah Ağırlığı',
  ],
  CNC_DIK_ISLEME_MERKEZ: CNC_DIK_ISLEME_TEMPLATE,
  DIK_ISLEME_MERKEZI: CNC_DIK_ISLEME_TEMPLATE,
};

const normalize = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const splitTriplet = (value: string, separator: RegExp): string[] => {
  const unit = value.match(/\s([a-zA-ZçğıöşüÇĞİÖŞÜ.\/]+)$/)?.[1] ?? '';
  return value
    .replace(/\s+[a-zA-ZçğıöşüÇĞİÖŞÜ.\/]+$/, '')
    .split(separator)
    .map((part) => `${part.trim()}${unit ? ` ${unit}` : ''}`)
    .filter(Boolean);
};

function expandVerticalMachining(specs: SpecRow[]): SpecRow[] {
  const expanded: SpecRow[] = [];
  for (const spec of specs) {
    const key = normalize(spec.key);
    if (key === 'x y z eksen hareketi') {
      const [x, y, z] = splitTriplet(spec.value, /\s*[x×]\s*/i);
      if (x) expanded.push({ key: 'X Eksen Hareketi', value: x });
      if (y) expanded.push({ key: 'Y Eksen Hareketi', value: y });
      if (z) expanded.push({ key: 'Z Eksen Hareketi', value: z });
    } else if (key === 'x y z eksen bosta ilerleme orani') {
      const [x, y, z] = splitTriplet(spec.value, /\s*\/\s*/);
      if (x) expanded.push({ key: 'X Eksen Boşta İlerleme Hızı', value: x });
      if (y) expanded.push({ key: 'Y Eksen Boşta İlerleme Hızı', value: y });
      if (z) expanded.push({ key: 'Z Eksen Boşta İlerleme Hızı', value: z });
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
  const template = TEMPLATES[typeCode];
  const source = typeCode === 'CNC_DIK_ISLEME_MERKEZ' || typeCode === 'DIK_ISLEME_MERKEZI'
    ? expandVerticalMachining(specs)
    : specs;
  const used = new Set<number>();
  const standard = template.map((key) => {
    const normalized = normalize(key);
    const index = source.findIndex((spec, specIndex) => !used.has(specIndex) && normalize(spec.key) === normalized);
    if (index < 0) return { key, value: '-' };
    used.add(index);
    return { key, value: source[index].value || '-' };
  });
  const custom = source.filter((spec, index) => !used.has(index) && (spec.key.trim() || spec.value.trim()));
  return [...standard, ...custom];
}

export async function up(db: DbClient): Promise<void> {
  const typeCodes = Object.keys(TEMPLATES);
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

  console.log(`[004_standardize_cnc_product_specs] standardized ${products.length} product(s).`);
}
