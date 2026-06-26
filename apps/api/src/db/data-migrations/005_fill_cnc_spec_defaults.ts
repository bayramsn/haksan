import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { DbClient } from '../client';
import { schema } from '../client';

type SpecDefault = { key: string; value: string };

const CNC_YATAY_TORNA_DEFAULTS: SpecDefault[] = [
  { key: 'Ayna Ölçüsü', value: '10"' },
  { key: 'Maks. Çevirme Kapasitesi', value: 'Ø 545 mm' },
  { key: 'Maks. Tornalama Çapı', value: 'Ø 380 mm' },
  { key: 'Maks. Tornalama Boyu', value: '1.000 mm' },
  { key: 'Maks. Çubuk İşleme Çapı', value: 'Ø 75 mm' },
  { key: 'Fener Mili Devri', value: '4.200 dv/dk' },
  { key: 'Fener Mili Motor Gücü', value: '15 kw' },
  { key: 'Fener Mili Standardı', value: 'A2-08' },
  { key: 'Fener Mili Delik Çapı', value: 'Ø 92 mm' },
  { key: 'Fener Mili Ön Rulman Çapı', value: 'Ø 130 mm' },
  { key: 'Karşı Punta Pinol Çapı', value: 'Ø 90 mm' },
  { key: 'Karşı Punta Pinol Hareketi', value: '85 mm' },
  { key: 'Karşı Punta Pinol Koniği', value: 'MT-5' },
  { key: 'Karşı Punta Gövde Hareketi', value: '960 mm' },
  { key: 'X Eksen Hareketi', value: '200 mm' },
  { key: 'Z Eksen Hareketi', value: '1.030 mm' },
  { key: 'X Eksen Boşta İlerleme Oranı', value: '20.000 mm/dk' },
  { key: 'Z Eksen Boşta İlerleme Oranı', value: '20.000 mm/dk' },
  { key: 'X Eksen Motor Gücü', value: '2,5 kw' },
  { key: 'Z Eksen Motor Gücü', value: '2,5 kw' },
  { key: 'Taret Tipi', value: 'Hidrolik Taret' },
  { key: 'Taret İstasyon Sayısı', value: '10 Adet' },
  { key: 'Maks. Kare Takım Ölçüsü', value: '25x25 mm' },
  { key: 'Maks. Yuvarlak Takım Ölçüsü', value: 'Ø 40 mm' },
  { key: 'Toplam Güç Gereksinimi', value: '30 kw' },
  { key: 'Soğutma Sıvısı Tank Kapasitesi', value: '125 lt' },
  { key: 'Tezgahın Kapladığı Alan', value: '4.557 x 1.618 x 2.115 mm' },
  { key: 'Tezgah Ağırlığı', value: '5.500 kg' },
];

const CNC_DIK_TORNA_DEFAULTS: SpecDefault[] = [
  { key: 'Tabla (Ayna) Çapı', value: '12"' },
  { key: 'Maks. Çevirme Kapasitesi', value: 'Ø 650 mm' },
  { key: 'Maks. Tornalama Çapı', value: 'Ø 550 mm' },
  { key: 'Maks. Tornalama Boyu', value: '500 mm' },
  { key: 'Maks. İş Parçası Ağırlığı', value: '500 kg' },
  { key: 'Tabla (Fener Mili) Motor Gücü', value: '15/18,5 kw' },
  { key: 'Tabla (Fener Mili) Devir Aralığı', value: '50 ~ 2.500 dv/dk' },
  { key: 'Fener Mili Delik Standardı', value: 'A2-08' },
  { key: 'Taret Tipi', value: 'Hidrolik Taret' },
  { key: 'İstasyon Sayısı', value: '8 Adet' },
  { key: 'Maks. Takım Uzunluğu', value: '2,8 sn' },
  { key: 'Maks. Kare Takım Çapı', value: '25 x 25 mm' },
  { key: 'Maks. Yuvarlak Takım Çapı', value: 'Ø 40 mm' },
  { key: 'X Eksen Hareketi', value: '-40 / 350 mm' },
  { key: 'Z Eksen Hareketi', value: '550 mm' },
  { key: 'X Eksen Boşta İlerleme Oranı', value: '12.000 mm/dk' },
  { key: 'Z Eksen Boşta İlerleme Oranı', value: '24.000 mm/dk' },
  { key: 'X Eksen Motor Gücü', value: '1,6 kw' },
  { key: 'Z Eksen Motor Gücü', value: '3,0 kw' },
  { key: 'Toplam Güç Gereksinimi', value: '40 kw' },
  { key: 'Toplam Hava Gereksinimi', value: '6 bar' },
  { key: 'Soğutma Sıvısı Tank Kapasitesi', value: '300 lt' },
  { key: 'Tezgah Ölçüleri', value: '2.850 x 2.000 x 3.100 mm' },
  { key: 'Tezgah Ağırlığı', value: '6.000 kg' },
];

const CNC_DIK_ISLEME_DEFAULTS: SpecDefault[] = [
  { key: 'Tabla Ölçüsü', value: '1.750 x 700 mm' },
  { key: 'T Slot Ölçü ve Sayısı', value: '18 x 125 x 5' },
  { key: 'Tabla Yükleme Kapasitesi', value: '1.500 kg' },
  { key: 'Tabla ~ Fener Mili Ucu Arası Mesafe', value: '130 ~ 830 mm' },
  { key: 'X Eksen Hareketi', value: '1.600 mm' },
  { key: 'Y Eksen Hareketi', value: '700 mm' },
  { key: 'Z Eksen Hareketi', value: '700 mm' },
  { key: 'X Eksen Boşta İlerleme Hızı', value: '36.000 mm/dk' },
  { key: 'Y Eksen Boşta İlerleme Hızı', value: '36.000 mm/dk' },
  { key: 'Z Eksen Boşta İlerleme Hızı', value: '36.000 mm/dk' },
  { key: 'X, Y, Z Eksen Kesme Hızı', value: '20.000 mm/dk' },
  { key: 'X, Y, Z Eksen Pozisyonlama Hassasiyeti', value: '0,017 / 300 mm' },
  { key: 'X, Y, Z Eksen Tekrarlama Hassasiyeti', value: '± 0,005 mm' },
  { key: 'Fener Mili Standardı', value: 'BT-40' },
  { key: 'Fener Mili Devri', value: '12.000 dv/dk' },
  { key: 'Fener Mili Aktarması', value: 'Direkt' },
  { key: 'Fener Mili Rulman Tipi', value: 'Çelik' },
  { key: 'Fener Mili Motor Gücü', value: '18,5 kw' },
  { key: 'Fener Mili Motor Tipi', value: 'AC Servo' },
  { key: 'X Eksen Motor Gücü', value: '4,0 kw' },
  { key: 'Y Eksen Motor Gücü', value: '4,0 kw' },
  { key: 'Z Eksen Motor Gücü', value: '4,0 kw' },
  { key: 'Soğutma Sistemi Motor Gücü', value: '0,75 kw x 2 Adet' },
  { key: 'Takım Değiştirici Tipi', value: 'Kol Tipi' },
  { key: 'Takım Kapasitesi', value: '30 Adet' },
  { key: 'Maks. Takım Ağırlığı', value: '7 kg' },
  { key: 'Maks. Takım Uzunluğu', value: '300 mm' },
  { key: 'Maks. Takım Çapı', value: 'Ø 75 / Ø 150 mm' },
  { key: 'Takım Değiştirme Süresi (Takımdan Takıma)', value: '1,4 sn' },
  { key: 'Tezgah Hava Gereksinimi', value: '6 bar (100 psi)' },
  { key: 'Toplam Güç Gereksinimi', value: '380 V / 50 Hz, 30 kw' },
  { key: 'Tezgah Ölçüleri', value: '4.350 x 2.507 x 3.240 mm' },
  { key: 'Tezgahın Kapladığı Alan', value: '5.950 x 3.530 x 3.240 mm' },
  { key: 'Tezgah Ağırlığı', value: '8.860 kg' },
];

const DEFAULTS_BY_TYPE: Record<string, SpecDefault[]> = {
  CNC_YATAY_TORNA_TEZGAHI: CNC_YATAY_TORNA_DEFAULTS,
  CNC_DIK_TORNA_TEZGAHI: CNC_DIK_TORNA_DEFAULTS,
  CNC_DIK_ISLEME_MERKEZ: CNC_DIK_ISLEME_DEFAULTS,
  DIK_ISLEME_MERKEZI: CNC_DIK_ISLEME_DEFAULTS,
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

export async function up(db: DbClient): Promise<void> {
  const products = await db
    .select({
      id: schema.productModels.id,
      tenantId: schema.productModels.tenantId,
      typeCode: schema.productTypes.code,
    })
    .from(schema.productModels)
    .innerJoin(schema.productTypes, eq(schema.productModels.productTypeId, schema.productTypes.id))
    .where(and(
      inArray(schema.productTypes.code, Object.keys(DEFAULTS_BY_TYPE)),
      isNull(schema.productModels.deletedAt),
    ));

  const generalGroup = await db.query.productSpecGroups.findFirst({
    where: eq(schema.productSpecGroups.code, 'GENEL'),
  });
  let updated = 0;
  let inserted = 0;

  for (const product of products) {
    const existing = await db
      .select({
        id: schema.productSpecs.id,
        key: schema.productSpecs.specKey,
        value: schema.productSpecs.specValue,
      })
      .from(schema.productSpecs)
      .where(and(
        eq(schema.productSpecs.productModelId, product.id),
        isNull(schema.productSpecs.deletedAt),
      ));

    for (const [sortOrder, specDefault] of DEFAULTS_BY_TYPE[product.typeCode].entries()) {
      const current = existing.find((spec) => normalize(spec.key) === normalize(specDefault.key));
      if (!current) {
        await db.insert(schema.productSpecs).values({
          tenantId: product.tenantId,
          productModelId: product.id,
          specGroupId: generalGroup?.id ?? null,
          specKey: specDefault.key,
          specValue: specDefault.value,
          sortOrder,
        });
        inserted++;
      } else if (!current.value.trim() || current.value.trim() === '-') {
        await db
          .update(schema.productSpecs)
          .set({ specValue: specDefault.value })
          .where(eq(schema.productSpecs.id, current.id));
        updated++;
      }
    }
  }

  console.log(`[005_fill_cnc_spec_defaults] updated ${updated}, inserted ${inserted} technical spec value(s).`);
}
