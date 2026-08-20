import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { and, eq, inArray, isNull, ne } from 'drizzle-orm';
import type { DbClient } from '../client';
import { schema } from '../client';
import { S3StorageProvider } from '../../shared/storage/s3-storage.provider';
import { loadEnv } from '../../config/env';

const MODEL_CODE = 'MMT-1170';
const PRODUCT_NAME = 'MMT-1170 CNC Dik İşleme Merkezi';
const IMAGE_BUCKET = 'erp-product-images';
const IMAGE_FILENAME = 'haksan-cnc-mmt-1170.jpg';
const IMAGE_SHA256 = '0211ec1a8c7e2817d0c0be370c956a0430d3338654304597a72cf8f48aea5513';

const TECHNICAL_SPECS = [
  ['TABLA', 'Tabla Ölçüsü', '1.200 x 700 mm'],
  ['TABLA', 'T Slot Ölçü ve Sayısı', '18 x 100 x 5'],
  ['TABLA', 'Tabla Yükleme Kapasitesi', '1.000 kg'],
  ['TABLA', 'Tabla ~ Fener Mili Ucu Arası Mesafe', '115 ~ 725 mm'],
  ['EKSENLER', 'X Eksen Hareketi', '1.100 mm'],
  ['EKSENLER', 'Y Eksen Hareketi', '700 mm'],
  ['EKSENLER', 'Z Eksen Hareketi', '660 mm'],
  ['EKSENLER', 'X Eksen Boşta İlerleme Hızı', '36.000 mm/dk'],
  ['EKSENLER', 'Y Eksen Boşta İlerleme Hızı', '36.000 mm/dk'],
  ['EKSENLER', 'Z Eksen Boşta İlerleme Hızı', '36.000 mm/dk'],
  ['EKSENLER', 'X, Y, Z Eksen Kesme Hızı', '20.000 mm/dk'],
  ['EKSENLER', 'X, Y, Z Eksen Pozisyonlama Hassasiyeti', '0,017 / 300 mm'],
  ['EKSENLER', 'X, Y, Z Eksen Tekrarlama Hassasiyeti', '± 0,005 mm'],
  ['FENER_MILI', 'Fener Mili Standardı', 'BBT-40'],
  ['FENER_MILI', 'Fener Mili Devri', '15.000 dv/dk'],
  ['FENER_MILI', 'Fener Mili Aktarması', 'Direkt'],
  ['FENER_MILI', 'Fener Mili Rulman Tipi', 'Çelik'],
  ['MOTORLAR', 'Fener Mili Motor Gücü', '15 kw (20 hp)'],
  ['MOTORLAR', 'Fener Mili Motor Tipi', 'AC Servo'],
  ['MOTORLAR', 'X Eksen Motor Gücü', '3,0 kw'],
  ['MOTORLAR', 'Y Eksen Motor Gücü', '3,0 kw'],
  ['MOTORLAR', 'Z Eksen Motor Gücü', '3,5 kw'],
  ['MOTORLAR', 'Soğutma Sistemi Motor Gücü', '0,75 kw x 2 Adet'],
  ['TAKIM_DEGISTIRICI', 'Takım Değiştirici Tipi', 'Kol Tipi'],
  ['TAKIM_DEGISTIRICI', 'Takım Kapasitesi', '30 Adet'],
  ['TAKIM_DEGISTIRICI', 'Maks. Takım Ağırlığı', '7 kg'],
  ['TAKIM_DEGISTIRICI', 'Maks. Takım Uzunluğu', '250 mm'],
  ['TAKIM_DEGISTIRICI', 'Maks. Takım Çapı', 'Ø 75 / Ø 150 mm'],
  ['TAKIM_DEGISTIRICI', 'Takım Değiştirme Süresi (Takımdan Takıma)', '2,2 sn'],
  ['GENEL', 'Tezgah Hava Gereksinimi', '6 bar (100 psi)'],
  ['GENEL', 'Toplam Güç Gereksinimi', '25 kw'],
  ['GENEL', 'Tezgah Ölçüleri', '-'],
  ['GENEL', 'Tezgahın Kapladığı Alan', '2.654 x 3.157 x 2.287 mm'],
  ['GENEL', 'Tezgah Ağırlığı', '7.500 kg'],
] as const;

const STANDARD_EQUIPMENT = [
  'MITSUBISHI M80 Cnc Kontrol Ünitesi',
  '10,4” LCD/TFT Renkli Dokunmatik Ekran',
  'PLC Kullanıcı Dostu Arayüzü',
  '“SSS” (Super Smooth Surface) Fonksiyonu',
  'Diyalog Programlama, Türkçe Dil Opsiyonu',
  'Ethernet Bağlantı Birimi, RS-232 Bağlantı Birimi',
  'SD Kart Okuma Yuvası, USB Okuma Yuvası',
  'X, Y, Z Eksenlerde Yüksek Hassasiyet ve Mukavemette Lineer Kızaklar',
  'X, Y, Z Eksenlerde Gres Lube Japon yağlama sistemi',
  'C-3 Kalitesinde Ön Gerilimi Alınmış Vidalı Miller',
  '“MEHANITE” Mukavemetli ve Hassas Döküm Gövde Yapısı',
  'Tam Kapalı Kabin & Kabin içi Yıkama Sistemi',
  'Fener Mili Yağ Soğutma Sistemi & Fener Mili Sürekli Hava Perdeleme Sistemi',
  'Fener Mili Ucundan Basınçlı Kesme Sıvısı Püskürtme Sistemi',
  'Fener Mili Çevresinden Basınçlı Hava ve Su Püskürtme Sistemi',
  'Kabin İçi LED Aydınlatma Sistemi x 2 Adet & LED Çalışma Lambası',
  'Otomatik (Alarmlı) Üniteden Programlanabilir Merkezi Yağlama Sistemi',
  'X, Y, Z Eksenlerde Paslanmaz Teleskopik Kızak Koruyucu Sistem',
  'Vidalı Tip Talaş Atma Helezonu & Talaş Arabası',
  'Otomatik Program Sonu Tezgah Kapama Fonksiyonu',
  'Led Ekranlı El Çarkı (MPG)',
  'Elektrik Kabini Isı Dengeleme Sistemi',
  '3 Renkli Alarm Lambası',
  'Hava & Su Tabancası',
  'Tezgâhı Kullanma ve Bakım Kitapları',
  'MITSUBISHI Programlama ve Kullanma Kitapları',
  'CE Normlarına Uygun Elektrik ve Güvenlik Tertibatı',
  '1 Yıl Mekanik Tezgâh Garantisi',
  '2 Yıl Kontrol Ünite Garantisi',
] as const;

async function attachImage(db: DbClient, tenantId: string, productId: string): Promise<string | null> {
  const existing = await db
    .select({ fileId: schema.files.id })
    .from(schema.productMedia)
    .innerJoin(schema.files, eq(schema.productMedia.fileId, schema.files.id))
    .where(
      and(
        eq(schema.productMedia.tenantId, tenantId),
        eq(schema.productMedia.productModelId, productId),
        eq(schema.files.sha256, IMAGE_SHA256),
        isNull(schema.files.deletedAt)
      )
    )
    .limit(1);
  if (existing[0]) return existing[0].fileId;

  const imagePath = join(__dirname, '..', 'seed', 'data', 'haksancnc', 'images', IMAGE_FILENAME);
  const body = await readFile(imagePath);
  if (createHash('sha256').update(body).digest('hex') !== IMAGE_SHA256) {
    throw new Error('MMT-1170 ürün görseli bütünlük kontrolünden geçemedi');
  }

  const storage = new S3StorageProvider();
  const objectKey = `${tenantId}/product/${productId}/${IMAGE_FILENAME}`;
  try {
    const remote = await storage.getFileMetadata(IMAGE_BUCKET, objectKey);
    if (remote && remote.sizeBytes !== body.byteLength) {
      throw new Error('MMT-1170 ürün görseli S3 boyutu beklenenle eşleşmiyor');
    }
    if (!remote) {
      await storage.uploadFile({
        bucket: IMAGE_BUCKET,
        objectKey,
        body,
        mimeType: 'image/jpeg',
        contentLength: body.byteLength,
      });
    }
  } catch (error) {
    if (loadEnv().NODE_ENV === 'production') throw error;
    console.warn(`[021_create_haxan_mmt_1170] yerel görsel yüklemesi atlandı: ${(error as Error).message}`);
    return null;
  }

  const provider = await db.query.storageProviders.findFirst({
    where: eq(schema.storageProviders.code, storage.providerCode),
  });
  const uploader = await db.query.users.findFirst({
    where: and(eq(schema.users.tenantId, tenantId), eq(schema.users.email, 'superadmin@haksan.local')),
  });
  const [file] = await db
    .insert(schema.files)
    .values({
      tenantId,
      bucket: IMAGE_BUCKET,
      objectKey,
      originalFilename: IMAGE_FILENAME,
      mimeType: 'image/jpeg',
      extension: 'jpg',
      sizeBytes: body.byteLength,
      sha256: IMAGE_SHA256,
      storageProviderId: provider?.id ?? null,
      visibility: 'public',
      uploadedBy: uploader?.id ?? null,
      uploadStatus: 'linked',
      uploadedAt: new Date(),
    })
    .returning({ id: schema.files.id });
  await db.insert(schema.productMedia).values({
    tenantId,
    productModelId: productId,
    fileId: file.id,
    mediaType: 'image',
    title: PRODUCT_NAME,
    sortOrder: 0,
  });
  return file.id;
}

export async function up(db: DbClient): Promise<void> {
  const tenant = await db.query.tenants.findFirst({
    where: and(eq(schema.tenants.slug, 'haksan'), eq(schema.tenants.isActive, true), isNull(schema.tenants.deletedAt)),
  });
  if (!tenant) {
    console.log('[021_create_haxan_mmt_1170] haksan tenant bulunamadı; atlandı.');
    return;
  }

  let brand = await db.query.brands.findFirst({
    where: and(eq(schema.brands.tenantId, tenant.id), eq(schema.brands.name, 'HAXAN')),
  });
  if (!brand) {
    [brand] = await db.insert(schema.brands).values({ tenantId: tenant.id, name: 'HAXAN' }).returning();
  }

  const [productGroup, category, subcategory, exactProductType, fallbackProductType, standardType] = await Promise.all([
    db.query.productGroups.findFirst({ where: eq(schema.productGroups.code, 'CNC') }),
    db.query.productCategories.findFirst({ where: eq(schema.productCategories.code, 'TEZGAH') }),
    db.query.productSubcategories.findFirst({ where: eq(schema.productSubcategories.code, 'ISLEME_MERKEZI') }),
    db.query.productTypes.findFirst({ where: eq(schema.productTypes.code, 'CNC_DIK_ISLEME_MERKEZ') }),
    db.query.productTypes.findFirst({ where: eq(schema.productTypes.code, 'DIK_ISLEME_MERKEZI') }),
    db.query.equipmentTypes.findFirst({ where: eq(schema.equipmentTypes.code, 'standart') }),
  ]);

  let product = await db.query.productModels.findFirst({
    where: and(eq(schema.productModels.tenantId, tenant.id), eq(schema.productModels.modelCode, MODEL_CODE)),
  });
  const productValues = {
    brandId: brand.id,
    series: 'MMT Serisi',
    productGroupId: productGroup?.id ?? null,
    categoryId: category?.id ?? null,
    subcategoryId: subcategory?.id ?? null,
    productTypeId: exactProductType?.id ?? fallbackProductType?.id ?? null,
    modelCode: MODEL_CODE,
    modelName: PRODUCT_NAME,
    fullName: PRODUCT_NAME,
    supplierCompanyId: null,
    currencyId: null,
    listPrice: null,
    cashPrice: null,
    vatRate: null,
    originCountry: null,
    hsCode: null,
    stockCode: null,
    description: null,
    muadilProductId: null,
    isActive: true,
    deletedAt: null,
  };
  if (product) {
    [product] = await db
      .update(schema.productModels)
      .set(productValues)
      .where(eq(schema.productModels.id, product.id))
      .returning();
  } else {
    [product] = await db.insert(schema.productModels).values({ tenantId: tenant.id, ...productValues }).returning();
  }

  const specGroups = await db
    .select({ id: schema.productSpecGroups.id, code: schema.productSpecGroups.code })
    .from(schema.productSpecGroups)
    .where(inArray(schema.productSpecGroups.code, [...new Set(TECHNICAL_SPECS.map(([code]) => code))]));
  const groupByCode = new Map(specGroups.map((group) => [group.code, group.id]));

  await db.delete(schema.productSpecs).where(eq(schema.productSpecs.productModelId, product.id));
  await db.insert(schema.productSpecs).values(
    TECHNICAL_SPECS.map(([groupCode, key, value], sortOrder) => ({
      tenantId: tenant.id,
      productModelId: product.id,
      specGroupId: groupByCode.get(groupCode) ?? null,
      specKey: key,
      specValue: value,
      sortOrder,
    }))
  );

  await db.delete(schema.productEquipmentItems).where(eq(schema.productEquipmentItems.productModelId, product.id));
  await db.insert(schema.productEquipmentItems).values(
    STANDARD_EQUIPMENT.map((title, sortOrder) => ({
      tenantId: tenant.id,
      productModelId: product.id,
      equipmentTypeId: standardType?.id ?? null,
      title,
      isPromotion: false,
      sortOrder,
    }))
  );

  const fileId = await attachImage(db, tenant.id, product.id);
  if (fileId) {
    await db
      .delete(schema.productMedia)
      .where(and(eq(schema.productMedia.productModelId, product.id), ne(schema.productMedia.fileId, fileId)));
    await db
      .update(schema.productModels)
      .set({ imageUrl: `/products/media/${fileId}` })
      .where(eq(schema.productModels.id, product.id));
  }

  console.log(
    `[021_create_haxan_mmt_1170] ürün hazır: ${PRODUCT_NAME}; teknik=${TECHNICAL_SPECS.length}; standart=${STANDARD_EQUIPMENT.length}; görsel=${fileId ? 'bağlandı' : 'yerelde atlandı'}.`
  );
}
