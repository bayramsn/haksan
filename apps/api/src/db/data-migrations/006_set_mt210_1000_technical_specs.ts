import { and, eq, isNull } from 'drizzle-orm';
import type { DbClient } from '../client';
import { schema } from '../client';

const TECHNICAL_SPECS = [
  ['Ayna Ölçüsü', '10"'],
  ['Maks. Çevirme Kapasitesi', 'Ø 545 mm'],
  ['Maks. Tornalama Çapı', 'Ø 380 mm'],
  ['Maks. Tornalama Boyu', '1.000 mm'],
  ['Maks. Çubuk İşleme Çapı', 'Ø 75 mm'],
  ['Fener Mili Devri', '4.200 dv/dk'],
  ['Fener Mili Motor Gücü', '15 kW'],
  ['Fener Mili Standardı', 'A2-08'],
  ['Fener Mili Delik Çapı', 'Ø 92 mm'],
  ['Fener Mili Ön Rulman Çapı', 'Ø 130 mm'],
  ['Karşı Punta Pinol Çapı', 'Ø 90 mm'],
  ['Karşı Punta Pinol Hareketi', '85 mm'],
  ['Karşı Punta Pinol Koniği', 'MT-5'],
  ['Karşı Punta Gövde Hareketi', '960 mm'],
  ['Karşı Ayna Ölçüsü', '-'],
  ['Karşı Ayna Çubuk İşleme Çapı', '-'],
  ['Karşı Ayna Devri', '-'],
  ['Karşı Ayna Motor Gücü', '-'],
  ['Canlı Takım Devri', '-'],
  ['Canlı Takım Motor Gücü', '-'],
  ['Bağlanabilir Canlı Takım Sayısı', '-'],
  ['Canlı Takım Tutucu Standardı', '-'],
  ['X Eksen Hareketi', '200 mm'],
  ['Z Eksen Hareketi', '1.030 mm'],
  ['Y Eksen Hareketi', '-'],
  ['Z-2 Eksen Hareketi', '-'],
  ['X Eksen Boşta İlerleme Oranı', '20.000 mm/dk'],
  ['Z Eksen Boşta İlerleme Oranı', '20.000 mm/dk'],
  ['Y Eksen Boşta İlerleme Oranı', '-'],
  ['Z-2 Eksen Boşta İlerleme Oranı', '-'],
  ['X Eksen Motor Gücü', '2,5 kW'],
  ['Z Eksen Motor Gücü', '2,5 kW'],
  ['Y Eksen Motor Gücü', '-'],
  ['Z-2 Eksen Motor Gücü', '-'],
  ['Taret Tipi', 'Hidrolik Taret'],
  ['Taret İstasyon Sayısı', '10 Adet'],
  ['Maks. Kare Takım Ölçüsü', '25x25 mm'],
  ['Maks. Yuvarlak Takım Ölçüsü', 'Ø 40 mm'],
  ['Toplam Güç Gereksinimi', '30 kW'],
  ['Toplam Hava Gereksinimi', '-'],
  ['Soğutma Sıvısı Tank Kapasitesi', '125 lt'],
  ['Tezgahın Kapladığı Alan', '4.557 x 1.618 x 2.115 mm'],
  ['Tezgah Ağırlığı', '5.500 kg'],
] as const;

export async function up(db: DbClient): Promise<void> {
  const products = await db
    .select({
      id: schema.productModels.id,
      tenantId: schema.productModels.tenantId,
    })
    .from(schema.productModels)
    .where(
      and(
        eq(schema.productModels.modelCode, 'MT-210/1000'),
        isNull(schema.productModels.deletedAt)
      )
    );

  for (const product of products) {
    const generalGroup = await db.query.productSpecGroups.findFirst({
      where: eq(schema.productSpecGroups.code, 'GENEL'),
    });

    await db
      .delete(schema.productSpecs)
      .where(eq(schema.productSpecs.productModelId, product.id));
    await db.insert(schema.productSpecs).values(
      TECHNICAL_SPECS.map(([key, value], sortOrder) => ({
        tenantId: product.tenantId,
        productModelId: product.id,
        specGroupId: generalGroup?.id ?? null,
        specKey: key,
        specValue: value,
        sortOrder,
      }))
    );
  }

  console.log(`[006_set_mt210_1000_technical_specs] updated ${products.length} product(s).`);
}
