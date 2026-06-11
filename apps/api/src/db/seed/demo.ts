/**
 * Seed demo tenant + 3 user roles + KILİTSAN/MANFORD/LK/ECOCA test data.
 * Run AFTER seedLookups() because it joins on lookup codes.
 */
import * as argon2 from 'argon2';
import { eq, and } from 'drizzle-orm';
import { getDb, closeDb, schema } from '../client';
import { allRoles, rolePermissionMatrix } from './_data';

async function getOrCreate<T extends { id: string }>(
  table: { findFirst?: never },
  finder: () => Promise<T | undefined>,
  creator: () => Promise<T>
): Promise<T> {
  const existing = await finder();
  if (existing) return existing;
  return creator();
}

export async function seedDemo(): Promise<void> {
  const db = getDb();

  // 1. Tenant
  const [tenant] = await db
    .insert(schema.tenants)
    .values({
      name: 'Haksan CNC',
      slug: 'haksan',
      taxNumber: '1234567890',
      email: 'info@haksan.local',
      phone: '+90 212 000 00 00',
    })
    .onConflictDoNothing({ target: schema.tenants.slug })
    .returning();

  const tenantRow =
    tenant ??
    (await db.query.tenants.findFirst({
      where: eq(schema.tenants.slug, 'haksan'),
    }))!;

  console.log(`[demo] tenant: ${tenantRow.id} (${tenantRow.slug})`);

  // 2. Roles + permissions
  const allPerms = await db.query.permissions.findMany();
  const permsByCode = new Map(allPerms.map((p) => [p.code, p]));

  for (const roleCode of allRoles) {
    const existingRole = await db.query.roles.findFirst({
      where: and(eq(schema.roles.tenantId, tenantRow.id), eq(schema.roles.code, roleCode)),
    });
    const role =
      existingRole ??
      (
        await db
          .insert(schema.roles)
          .values({
            tenantId: tenantRow.id,
            code: roleCode,
            name: roleCode.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
            isSystemRole: true,
          })
          .returning()
      )[0];

    // role permissions
    const matrix = rolePermissionMatrix[roleCode] ?? {};
    const permCodes: string[] = [];
    for (const [resource, actions] of Object.entries(matrix)) {
      const resourceList = resource === '*' ? Array.from(new Set(allPerms.map((p) => p.resource))) : [resource];
      for (const r of resourceList) {
        const actionList =
          actions === '*'
            ? Array.from(new Set(allPerms.filter((p) => p.resource === r).map((p) => p.action)))
            : (actions as string[]);
        for (const a of actionList) permCodes.push(`${r}.${a}`);
      }
    }
    const rows = permCodes
      .map((code) => permsByCode.get(code))
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map((p) => ({ roleId: role.id, permissionId: p.id }));
    if (rows.length) {
      await db.insert(schema.rolePermissions).values(rows).onConflictDoNothing();
    }
    console.log(`[demo] role: ${role.code} → ${rows.length} permissions`);
  }

  const rolesByCode = new Map(
    (await db.query.roles.findMany({ where: eq(schema.roles.tenantId, tenantRow.id) })).map((r) => [r.code, r])
  );

  // 3. Departments
  const deptDefs = [
    { code: 'sales', name: 'Satış' },
    { code: 'service', name: 'Servis' },
    { code: 'finance', name: 'Finans' },
    { code: 'stock', name: 'Stok' },
  ];
  for (const d of deptDefs) {
    const existing = await db.query.departments.findFirst({
      where: and(eq(schema.departments.tenantId, tenantRow.id), eq(schema.departments.code, d.code)),
    });
    if (!existing) {
      await db.insert(schema.departments).values({ tenantId: tenantRow.id, ...d });
    }
  }
  const salesDept = await db.query.departments.findFirst({
    where: and(eq(schema.departments.tenantId, tenantRow.id), eq(schema.departments.code, 'sales')),
  });

  // 4. Users
  const userDefs = [
    { email: 'superadmin@haksan.local', fullName: 'Süper Yönetici', password: 'superadmin12345', roles: ['super_admin'] },
    { email: 'admin@haksan.local', fullName: 'Sistem Yöneticisi', password: 'admin12345', roles: ['admin'] },
    { email: 'sales@haksan.local', fullName: 'Ersin Çetinbilek', password: 'sales12345', roles: ['sales'] },
    { email: 'service@haksan.local', fullName: 'Servis Sorumlusu', password: 'service12345', roles: ['service'] },
    { email: 'finance@haksan.local', fullName: 'Finans Sorumlusu', password: 'finance12345', roles: ['finance'] },
  ];
  for (const u of userDefs) {
    const existing = await db.query.users.findFirst({
      where: and(eq(schema.users.tenantId, tenantRow.id), eq(schema.users.email, u.email)),
    });
    if (existing) continue;
    const hash = await argon2.hash(u.password, { type: argon2.argon2id });
    const [user] = await db
      .insert(schema.users)
      .values({
        tenantId: tenantRow.id,
        departmentId: salesDept?.id ?? null,
        fullName: u.fullName,
        email: u.email,
        passwordHash: hash,
      })
      .returning();
    for (const roleCode of u.roles) {
      const role = rolesByCode.get(roleCode);
      if (role) {
        await db
          .insert(schema.userRoles)
          .values({ userId: user.id, roleId: role.id })
          .onConflictDoNothing();
      }
    }
    console.log(`[demo] user: ${u.email} / ${u.password}`);
  }

  // Lookup id helpers
  const lookupId = async (table: keyof typeof schema, code: string): Promise<string | undefined> => {
    // @ts-expect-error dynamic table lookup
    const row = await db.query[table].findFirst({ where: eq((schema as any)[table].code, code) });
    return row?.id;
  };

  // 5. Brands
  const brandDefs = [
    { name: 'MANFORD', country: 'Tayvan' },
    { name: 'LK', country: 'Çin' },
    { name: 'ECOCA', country: 'Tayvan' },
    { name: 'FANUC', country: 'Japonya' },
    { name: 'NSK', country: 'Japonya' },
    { name: 'Haksan', country: 'Türkiye' },
  ];
  for (const b of brandDefs) {
    const existing = await db.query.brands.findFirst({
      where: and(eq(schema.brands.tenantId, tenantRow.id), eq(schema.brands.name, b.name)),
    });
    if (!existing) {
      await db.insert(schema.brands).values({ tenantId: tenantRow.id, ...b });
    }
  }
  const brandsByName = new Map(
    (await db.query.brands.findMany({ where: eq(schema.brands.tenantId, tenantRow.id) })).map((b) => [b.name, b])
  );

  // 6. Companies
  const companyDefs = [
    {
      legalTitle: 'KİLİTSAN KALIP İMALAT SAN. TİC. LTD. ŞTİ.',
      shortName: 'KİLİTSAN',
      relationCode: 'customer',
      statusCode: 'potential',
      sector: 'Kalıp İmalat',
      taxNumber: '5550001111',
      address: 'Yeni Mah. Yavuz Sultan Selim Cad. No:121, Hendek, Sakarya',
      phone: '+90 264 614 76 48',
      email: 'kilitsan@kilitsan.com',
    },
    {
      legalTitle: 'Contra Makine San. ve Tic. Ltd. Şti.',
      shortName: 'Contra Makine',
      relationCode: 'customer',
      statusCode: 'active',
      sector: 'Makine İmalat',
      taxNumber: '5550002222',
      address: 'İstanbul',
      phone: '+90 212 000 00 02',
      email: 'info@contramakine.com',
    },
    {
      legalTitle: 'ALİŞLER MAKİNA',
      shortName: 'ALİŞLER',
      relationCode: 'customer',
      statusCode: 'active',
      sector: 'Makine',
      taxNumber: '5550003333',
      address: 'Bursa',
      phone: '+90 224 000 00 00',
      email: 'info@aliplermakina.local',
    },
  ];

  const relTypeMap = new Map<string, string>();
  for (const c of ['customer', 'supplier', 'supplier_customer']) {
    const id = await lookupId('companyRelationTypes', c);
    if (id) relTypeMap.set(c, id);
  }
  const statusMap = new Map<string, string>();
  for (const s of ['potential', 'active', 'passive', 'blacklist']) {
    const id = await lookupId('companyStatuses', s);
    if (id) statusMap.set(s, id);
  }

  for (const c of companyDefs) {
    const existing = await db.query.companies.findFirst({
      where: and(eq(schema.companies.tenantId, tenantRow.id), eq(schema.companies.legalTitle, c.legalTitle)),
    });
    if (existing) continue;
    const [company] = await db
      .insert(schema.companies)
      .values({
        tenantId: tenantRow.id,
        companyType: 'company',
        relationTypeId: relTypeMap.get(c.relationCode),
        customerStatusId: statusMap.get(c.statusCode),
        legalTitle: c.legalTitle,
        shortName: c.shortName,
        sector: c.sector,
        taxNumber: c.taxNumber,
      })
      .returning();
    if (c.address) {
      await db.insert(schema.companyAddresses).values({
        tenantId: tenantRow.id,
        companyId: company.id,
        addressType: 'billing',
        country: 'Türkiye',
        fullAddress: c.address,
        isDefault: true,
      });
    }
    if (c.phone) {
      await db.insert(schema.companyPhones).values({
        tenantId: tenantRow.id,
        companyId: company.id,
        phoneType: 'main',
        phone: c.phone,
        isDefault: true,
      });
    }
    if (c.email) {
      await db.insert(schema.companyEmails).values({
        tenantId: tenantRow.id,
        companyId: company.id,
        emailType: 'main',
        email: c.email,
        isDefault: true,
      });
    }
    console.log(`[demo] company: ${c.legalTitle}`);
  }

  // 7. Contacts
  const kilitsan = await db.query.companies.findFirst({
    where: and(
      eq(schema.companies.tenantId, tenantRow.id),
      eq(schema.companies.legalTitle, 'KİLİTSAN KALIP İMALAT SAN. TİC. LTD. ŞTİ.')
    ),
  });
  const contra = await db.query.companies.findFirst({
    where: and(
      eq(schema.companies.tenantId, tenantRow.id),
      eq(schema.companies.legalTitle, 'Contra Makine San. ve Tic. Ltd. Şti.')
    ),
  });
  const alipler = await db.query.companies.findFirst({
    where: and(eq(schema.companies.tenantId, tenantRow.id), eq(schema.companies.legalTitle, 'ALİŞLER MAKİNA')),
  });

  const contactDefs = [
    {
      companyId: kilitsan?.id,
      fullName: 'Metin YILMAZ',
      mobilePhone: '+90 539 398 20 50',
      isPrimary: true,
    },
    {
      companyId: contra?.id,
      fullName: 'Özgür ŞİMŞEK',
      mobilePhone: '+90 532 000 00 02',
      isPrimary: true,
    },
    {
      companyId: alipler?.id,
      fullName: 'Melih Kuyucu',
      mobilePhone: '+90 532 000 00 03',
      isPrimary: true,
    },
  ];

  for (const c of contactDefs) {
    if (!c.companyId) continue;
    const existing = await db.query.contacts.findFirst({
      where: and(
        eq(schema.contacts.tenantId, tenantRow.id),
        eq(schema.contacts.companyId, c.companyId),
        eq(schema.contacts.fullName, c.fullName)
      ),
    });
    if (!existing) {
      await db.insert(schema.contacts).values({
        tenantId: tenantRow.id,
        companyId: c.companyId,
        fullName: c.fullName,
        mobilePhone: c.mobilePhone,
        isPrimary: c.isPrimary,
      });
      console.log(`[demo] contact: ${c.fullName}`);
    }
  }

  // 8. Products + specs
  const usd = await db.query.currencies.findFirst({ where: eq(schema.currencies.code, 'USD') });
  const cncGroup = await db.query.productGroups.findFirst({ where: eq(schema.productGroups.code, 'CNC') });
  const tezgahCat = await db.query.productCategories.findFirst({ where: eq(schema.productCategories.code, 'TEZGAH') });
  const islemeSub = await db.query.productSubcategories.findFirst({
    where: eq(schema.productSubcategories.code, 'ISLEME_MERKEZI'),
  });
  const tornaSub = await db.query.productSubcategories.findFirst({
    where: eq(schema.productSubcategories.code, 'TORNA'),
  });
  const koprupType = await db.query.productTypes.findFirst({
    where: eq(schema.productTypes.code, 'KOPRU_TIPI_ISLEME_MERKEZI'),
  });
  const dikType = await db.query.productTypes.findFirst({
    where: eq(schema.productTypes.code, 'DIK_ISLEME_MERKEZI'),
  });
  const tornaType = await db.query.productTypes.findFirst({ where: eq(schema.productTypes.code, 'CNC_TORNA') });

  const productDefs = [
    {
      brand: 'MANFORD',
      modelCode: 'DL-2112',
      fullName: 'MANFORD DL-2112 Köprü Tipi CNC Dik İşleme Merkezi',
      modelName: 'DL-2112',
      typeId: koprupType?.id,
      subId: islemeSub?.id,
      image: 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=800',
      listPrice: '191000.0000',
      cashPrice: '170000.0000',
      vatRate: '20',
      specs: [
        ['TABLA', 'Tabla Ölçüsü', '2.000 x 1.100', 'mm'],
        ['TABLA', 'T Slot Ölçü ve Sayısı', '22 x 150 x 7', ''],
        ['TABLA', 'Tabla Yükleme Kapasitesi', '4.000', 'kg'],
        ['EKSENLER', 'Kolonlar Arası Mesafe', '1.400', 'mm'],
        ['EKSENLER', 'Tabla ~ Fener Mili Ucu Arası Mesafe', '100 ~ 900', 'mm'],
        ['EKSENLER', 'X Eksen Hareketi', '2.100', 'mm'],
        ['EKSENLER', 'Y Eksen Hareketi', '1.220', 'mm'],
        ['EKSENLER', 'Z Eksen Hareketi', '800', 'mm'],
        ['EKSENLER', 'X Eksen Boşta İlerleme Hızı', '12.000', 'mm/dk'],
        ['EKSENLER', 'Y Eksen Boşta İlerleme Hızı', '15.000', 'mm/dk'],
        ['EKSENLER', 'Z Eksen Boşta İlerleme Hızı', '15.000', 'mm/dk'],
        ['EKSENLER', 'X/Y/Z Kesme Hızı', '10.000', 'mm/dk'],
        ['EKSENLER', 'Pozisyonlama Hassasiyeti', '± 0,005 / 300', 'mm'],
        ['EKSENLER', 'Tekrarlama Hassasiyeti', '± 0,003 / 300', 'mm'],
        ['FENER_MILI', 'Fener Mili Standardı', 'BT-40', ''],
        ['FENER_MILI', 'Fener Mili Devri', '10.000', 'dv/dk'],
        ['FENER_MILI', 'Fener Mili Aktarması', 'Direk Aktarma', ''],
        ['FENER_MILI', 'Fener Mili Rulman Tipi', 'Çelik', ''],
        ['MOTORLAR', 'Fener Mili Motor Gücü', '15 kw / 20 hp', ''],
        ['MOTORLAR', 'X Eksen Motor Gücü', '9,0', 'kw'],
        ['MOTORLAR', 'Y Eksen Motor Gücü', '4,5', 'kw'],
        ['MOTORLAR', 'Z Eksen Motor Gücü', '4,5', 'kw'],
        ['TAKIM_DEGISTIRICI', 'Takım Kapasitesi', '24', 'Adet'],
        ['TAKIM_DEGISTIRICI', 'Maksimum Takım Ağırlığı', '8', 'kg'],
        ['TAKIM_DEGISTIRICI', 'Maksimum Takım Uzunluğu', '300', 'mm'],
        ['TAKIM_DEGISTIRICI', 'Maksimum Takım Çapı', 'Ø125 / Ø250', 'mm'],
        ['TAKIM_DEGISTIRICI', 'Takım Değiştirme Süresi', '6,0', 'sn'],
        ['GENEL', 'Hava Gereksinimi', '6 bar / 100 psi', ''],
        ['GENEL', 'Toplam Güç Gereksinimi', '380V / 50Hz / 30kw', ''],
        ['GENEL', 'Kapladığı Alan', '6.455 x 3.640 x 3.850', 'mm'],
        ['GENEL', 'Ağırlık', '15.500', 'kg'],
      ],
    },
    {
      brand: 'LK',
      modelCode: 'MV-1050',
      fullName: 'LK MV-1050 CNC Dik İşleme Merkezi',
      modelName: 'MV-1050',
      typeId: dikType?.id,
      subId: islemeSub?.id,
      image: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800',
      listPrice: '81810.0000',
      cashPrice: '72000.0000',
      vatRate: '20',
      specs: [
        ['TABLA', 'Tabla Ölçüsü', '1.100 x 550', 'mm'],
        ['EKSENLER', 'X Eksen Hareketi', '1.050', 'mm'],
        ['EKSENLER', 'Y Eksen Hareketi', '550', 'mm'],
        ['EKSENLER', 'Z Eksen Hareketi', '550', 'mm'],
        ['FENER_MILI', 'Fener Mili Standardı', 'BT-40', ''],
        ['FENER_MILI', 'Fener Mili Devri', '8.000', 'dv/dk'],
        ['TAKIM_DEGISTIRICI', 'Takım Kapasitesi', '24', 'Adet'],
      ],
    },
    {
      brand: 'ECOCA',
      modelCode: 'MT-208/500',
      fullName: 'ECOCA MT-208/500 CNC Torna Tezgahı',
      modelName: 'MT-208/500',
      typeId: tornaType?.id,
      subId: tornaSub?.id,
      image: 'https://images.unsplash.com/photo-1565043589221-1a6fd9ae45c7?w=800',
      listPrice: '74588.0000',
      cashPrice: '68300.0000',
      vatRate: '8',
      specs: [
        ['KAPASITE', 'Maksimum İşleme Çapı', '500', 'mm'],
        ['KAPASITE', 'Punta Arası Mesafe', '500', 'mm'],
        ['TARET', 'Takım Yuvası Sayısı', '8', 'Adet'],
        ['FENER_MILI', 'Fener Mili Devri', '4.000', 'dv/dk'],
        ['KARSI_PUNTA', 'Hidrolik Karşı Punta', 'Standart', ''],
      ],
    },
  ];

  for (const p of productDefs) {
    const brand = brandsByName.get(p.brand);
    if (!brand) continue;
    const existing = await db.query.productModels.findFirst({
      where: and(eq(schema.productModels.tenantId, tenantRow.id), eq(schema.productModels.modelCode, p.modelCode)),
    });
    if (existing) continue;
    const [model] = await db
      .insert(schema.productModels)
      .values({
        tenantId: tenantRow.id,
        brandId: brand.id,
        productGroupId: cncGroup?.id,
        categoryId: tezgahCat?.id,
        subcategoryId: p.subId,
        productTypeId: p.typeId,
        modelCode: p.modelCode,
        modelName: p.modelName,
        fullName: p.fullName,
        currencyId: usd?.id,
        imageUrl: p.image,
        listPrice: p.listPrice,
        cashPrice: p.cashPrice,
        vatRate: p.vatRate,
      })
      .returning();
    // specs
    for (let i = 0; i < p.specs.length; i++) {
      const [groupCode, key, value, unit] = p.specs[i];
      const group = await db.query.productSpecGroups.findFirst({
        where: eq(schema.productSpecGroups.code, groupCode),
      });
      await db.insert(schema.productSpecs).values({
        tenantId: tenantRow.id,
        productModelId: model.id,
        specGroupId: group?.id,
        specKey: key,
        specValue: value,
        specUnit: unit || null,
        sortOrder: i,
      });
    }
    console.log(`[demo] product: ${p.fullName} + ${p.specs.length} specs`);
  }

  // 8b. Optional equipment (with prices) per tezgah — shown in the SALES price list
  const opsiyonelType = await db.query.equipmentTypes.findFirst({
    where: eq(schema.equipmentTypes.code, 'opsiyonel'),
  });
  const equipmentByModel: Record<string, Array<{ title: string; price: string; desc?: string }>> = {
    'DL-2112': [
      { title: '4. Eksen CNC Divizör (Ø255 mm)', price: '8500.0000', desc: 'Tam otomatik, hidrolik kilitlemeli döner tabla' },
      { title: 'Renishaw Takım Ölçme Probu (OTS)', price: '6200.0000' },
      { title: 'Yüksek Basınçlı İç Soğutma (20 bar)', price: '3800.0000' },
      { title: 'Zincirli Talaş Konveyörü', price: '2400.0000' },
    ],
    'MV-1050': [
      { title: '4. Eksen CNC Divizör (Ø170 mm)', price: '6500.0000' },
      { title: 'Renishaw İş Parçası Probu (OMP)', price: '4800.0000' },
      { title: 'Yağ Sıyırıcı (Oil Skimmer)', price: '950.0000' },
    ],
    'MT-208/500': [
      { title: 'Hidrolik Pens Ünitesi', price: '3200.0000' },
      { title: 'Parça Yakalayıcı (Parts Catcher)', price: '1800.0000' },
      { title: 'Otomatik Bar Besleyici (Bar Feeder)', price: '9500.0000' },
    ],
  };
  for (const [modelCode, items] of Object.entries(equipmentByModel)) {
    const model = await db.query.productModels.findFirst({
      where: and(eq(schema.productModels.tenantId, tenantRow.id), eq(schema.productModels.modelCode, modelCode)),
    });
    if (!model) continue;
    const already = await db.query.productEquipmentItems.findFirst({
      where: eq(schema.productEquipmentItems.productModelId, model.id),
    });
    if (already) continue;
    await db.insert(schema.productEquipmentItems).values(
      items.map((it, i) => ({
        tenantId: tenantRow.id,
        productModelId: model.id,
        equipmentTypeId: opsiyonelType?.id,
        title: it.title,
        description: it.desc ?? null,
        isPromotion: false,
        unitPrice: it.price,
        currencyId: usd?.id,
        sortOrder: i,
      }))
    );
    console.log(`[demo] optional equipment: ${modelCode} +${items.length}`);
  }

  // 8c. Spare parts (cat YEDEK_PARCA) + labor (cat ISCILIK) — shown in the SERVICE price list
  const yedekCat = await db.query.productCategories.findFirst({ where: eq(schema.productCategories.code, 'YEDEK_PARCA') });
  const iscilikCat = await db.query.productCategories.findFirst({ where: eq(schema.productCategories.code, 'ISCILIK') });
  const yedekGroup = await db.query.productGroups.findFirst({ where: eq(schema.productGroups.code, 'YEDEK_PARCA') });
  const iscilikType = await db.query.productTypes.findFirst({ where: eq(schema.productTypes.code, 'ISCILIK') });
  const sparePartImg = 'https://images.unsplash.com/photo-1530124566582-a618bc2615dc?w=800';

  const catalogDefs: Array<{
    brand: string; modelCode: string; fullName: string; categoryId?: string; groupId?: string;
    typeId?: string; image?: string; listPrice: string; cashPrice?: string; vatRate: string;
  }> = [
    // — Yedek parça —
    { brand: 'FANUC', modelCode: 'YP-FNC-0iMF-KART', fullName: 'FANUC 0i-MF Plus Ana Kontrol Kartı', categoryId: yedekCat?.id, groupId: yedekGroup?.id, image: sparePartImg, listPrice: '4200.0000', cashPrice: '3800.0000', vatRate: '20' },
    { brand: 'NSK', modelCode: 'YP-BT40-RULMAN', fullName: 'BT-40 Fener Mili Rulman Seti (NSK)', categoryId: yedekCat?.id, groupId: yedekGroup?.id, image: sparePartImg, listPrice: '1600.0000', cashPrice: '1450.0000', vatRate: '20' },
    { brand: 'FANUC', modelCode: 'YP-SERVO-X-15', fullName: 'X Ekseni AC Servo Motor (1.5 kW)', categoryId: yedekCat?.id, groupId: yedekGroup?.id, image: sparePartImg, listPrice: '2300.0000', cashPrice: '2100.0000', vatRate: '20' },
    { brand: 'Haksan', modelCode: 'YP-HID-POMPA', fullName: 'Hidrolik Güç Ünitesi Pompası', categoryId: yedekCat?.id, groupId: yedekGroup?.id, image: sparePartImg, listPrice: '980.0000', cashPrice: '880.0000', vatRate: '20' },
    { brand: 'NSK', modelCode: 'YP-LINEER-ARABA', fullName: 'Lineer Kızak Arabası (NSK NH35)', categoryId: yedekCat?.id, groupId: yedekGroup?.id, image: sparePartImg, listPrice: '540.0000', cashPrice: '490.0000', vatRate: '20' },
    { brand: 'Haksan', modelCode: 'YP-YAGLAMA', fullName: 'Merkezi Yağlama Pompası', categoryId: yedekCat?.id, groupId: yedekGroup?.id, image: sparePartImg, listPrice: '420.0000', cashPrice: '380.0000', vatRate: '20' },
    // — İşçilik — listPrice = birim ücret
    { brand: 'Haksan', modelCode: 'ISC-SAHA-SAAT', fullName: 'Saha Servis İşçiliği (Saatlik)', categoryId: iscilikCat?.id, typeId: iscilikType?.id, listPrice: '75.0000', vatRate: '20' },
    { brand: 'Haksan', modelCode: 'ISC-KURULUM-GUN', fullName: 'Kurulum & Devreye Alma (Günlük)', categoryId: iscilikCat?.id, typeId: iscilikType?.id, listPrice: '600.0000', vatRate: '20' },
    { brand: 'Haksan', modelCode: 'ISC-BAKIM-SEFER', fullName: 'Periyodik Bakım (Sefer)', categoryId: iscilikCat?.id, typeId: iscilikType?.id, listPrice: '450.0000', vatRate: '20' },
    { brand: 'Haksan', modelCode: 'ISC-TESHIS-SAAT', fullName: 'Arıza Teşhis & Diagnostik (Saatlik)', categoryId: iscilikCat?.id, typeId: iscilikType?.id, listPrice: '90.0000', vatRate: '20' },
    { brand: 'Haksan', modelCode: 'ISC-YOL-GUN', fullName: 'Yol & Konaklama (Günlük)', categoryId: iscilikCat?.id, typeId: iscilikType?.id, listPrice: '250.0000', vatRate: '20' },
  ];

  for (const c of catalogDefs) {
    const brand = brandsByName.get(c.brand);
    if (!brand) continue;
    const existing = await db.query.productModels.findFirst({
      where: and(eq(schema.productModels.tenantId, tenantRow.id), eq(schema.productModels.modelCode, c.modelCode)),
    });
    if (existing) continue;
    await db.insert(schema.productModels).values({
      tenantId: tenantRow.id,
      brandId: brand.id,
      productGroupId: c.groupId,
      categoryId: c.categoryId,
      productTypeId: c.typeId,
      modelCode: c.modelCode,
      fullName: c.fullName,
      currencyId: usd?.id,
      imageUrl: c.image,
      listPrice: c.listPrice,
      cashPrice: c.cashPrice,
      vatRate: c.vatRate,
    });
  }
  console.log(`[demo] catalog: +${catalogDefs.length} spare parts / labor`);

  // 9. Quotes (one per product/customer)
  const sales = await db.query.users.findFirst({
    where: and(eq(schema.users.tenantId, tenantRow.id), eq(schema.users.email, 'sales@haksan.local')),
  });
  const draftStatus = await db.query.quoteStatuses.findFirst({ where: eq(schema.quoteStatuses.code, 'draft') });
  const adetUnit = await db.query.units.findFirst({ where: eq(schema.units.code, 'adet') });

  const quoteDefs = [
    {
      companyId: kilitsan?.id,
      modelCode: 'DL-2112',
      documentNo: '2026/16',
      quoteDate: new Date('2026-05-28'),
      validityDays: 5,
      qty: '1',
      unitPrice: '191000.0000',
      discount: '21000.0000',
      vatRate: '20',
      currency: 'USD',
    },
    {
      companyId: contra?.id,
      modelCode: 'MV-1050',
      documentNo: '2026/040',
      quoteDate: new Date('2026-05-28'),
      validityDays: 5,
      qty: '1',
      unitPrice: '81810.0000',
      discount: '9810.0000',
      vatRate: '20',
      currency: 'USD',
    },
    {
      companyId: alipler?.id,
      modelCode: 'MT-208/500',
      documentNo: '2023/089',
      quoteDate: new Date('2023-05-12'),
      validityDays: 5,
      qty: '1',
      unitPrice: '74588.0000',
      discount: '6288.0000',
      vatRate: '8',
      currency: 'USD',
    },
  ];

  for (const q of quoteDefs) {
    if (!q.companyId) continue;
    const existing = await db.query.quotes.findFirst({
      where: and(eq(schema.quotes.tenantId, tenantRow.id), eq(schema.quotes.documentNo, q.documentNo)),
    });
    if (existing) continue;
    const model = await db.query.productModels.findFirst({
      where: and(eq(schema.productModels.tenantId, tenantRow.id), eq(schema.productModels.modelCode, q.modelCode)),
    });
    if (!model) continue;
    const qty = Number(q.qty);
    const unitPrice = Number(q.unitPrice);
    const discount = Number(q.discount);
    const vatRate = Number(q.vatRate);
    const lineSubtotal = qty * unitPrice - discount;
    // For USD export quotes, KDV is typically 0 — but we honor the displayed rate
    const vatAmount = 0;
    const grandTotal = lineSubtotal;

    const [quote] = await db
      .insert(schema.quotes)
      .values({
        tenantId: tenantRow.id,
        companyId: q.companyId,
        documentNo: q.documentNo,
        quoteDate: q.quoteDate,
        validityDays: q.validityDays,
        projectOwnerUserId: sales?.id,
        currencyId: usd?.id,
        subtotal: lineSubtotal.toFixed(4),
        discountTotal: discount.toFixed(4),
        vatRate: vatRate.toFixed(2),
        vatAmount: vatAmount.toFixed(4),
        grandTotal: grandTotal.toFixed(4),
        statusId: draftStatus?.id,
        createdBy: sales?.id,
      })
      .returning();
    await db.insert(schema.quoteItems).values({
      tenantId: tenantRow.id,
      quoteId: quote.id,
      productModelId: model.id,
      description: model.fullName,
      quantity: q.qty,
      unitId: adetUnit?.id,
      unitPrice: q.unitPrice,
      discountAmount: q.discount,
      vatRate: q.vatRate,
      vatAmount: '0.0000',
      lineTotal: grandTotal.toFixed(4),
      sortOrder: 0,
    });
    console.log(`[demo] quote: ${q.documentNo} ${q.currency} ${grandTotal}`);
  }

  // 9b. Ret/kazanma nedenleri, rakipler ve yıllara yayılı fırsatlar (Karlılık / Yıl Sonu raporu)
  const reasonDefs = [
    { code: 'price', name: 'Fiyat / Bütçe Yetersiz' },
    { code: 'competitor', name: 'Rakip Tercih Edildi' },
    { code: 'timing', name: 'Zamanlama / Yatırım Ertelendi' },
    { code: 'spec', name: 'Teknik Şartname Karşılanamadı' },
    { code: 'no_budget', name: 'Bütçe Onayı Çıkmadı' },
    { code: 'other', name: 'Diğer' },
  ];
  await db
    .insert(schema.cancellationReasons)
    .values(reasonDefs.map((r) => ({ tenantId: tenantRow.id, code: r.code, name: r.name })))
    .onConflictDoNothing();
  const reasonRows = await db
    .select({ id: schema.cancellationReasons.id, code: schema.cancellationReasons.code })
    .from(schema.cancellationReasons)
    .where(eq(schema.cancellationReasons.tenantId, tenantRow.id));
  const reasonByCode = new Map(reasonRows.map((r) => [r.code, r.id]));

  const competitorDefs = ['DMG MORI', 'Haas Automation', 'DN Solutions (Doosan)', 'Mazak', 'TAKSAN'];
  const existingCompNames = new Set(
    (
      await db
        .select({ name: schema.competitors.name })
        .from(schema.competitors)
        .where(eq(schema.competitors.tenantId, tenantRow.id))
    ).map((c) => c.name)
  );
  const newComps = competitorDefs.filter((n) => !existingCompNames.has(n));
  if (newComps.length) {
    await db.insert(schema.competitors).values(newComps.map((name) => ({ tenantId: tenantRow.id, name })));
  }
  const compIds = (
    await db.select({ id: schema.competitors.id }).from(schema.competitors).where(eq(schema.competitors.tenantId, tenantRow.id))
  ).map((c) => c.id);

  const oppExisting = await db
    .select({ id: schema.opportunities.id })
    .from(schema.opportunities)
    .where(eq(schema.opportunities.tenantId, tenantRow.id))
    .limit(1);
  if (oppExisting.length === 0) {
    const stageId = async (code: string) =>
      (
        await db
          .select({ id: schema.pipelineStages.id })
          .from(schema.pipelineStages)
          .where(eq(schema.pipelineStages.code, code))
          .limit(1)
      )[0]?.id;
    const [deliveredId, contractId, cancelledId, quoteStageId, salesStageId, visitStageId] = await Promise.all([
      stageId('delivered'),
      stageId('contract'),
      stageId('cancelled'),
      stageId('quote'),
      stageId('sales'),
      stageId('visit'),
    ]);
    const oppCompanies = [kilitsan, contra, alipler].filter((c): c is NonNullable<typeof c> => !!c);
    const machines = [
      { name: 'MANFORD DL-2112 İşleme Merkezi', value: 170000 },
      { name: 'LK MV-1050 Dik İşleme Merkezi', value: 72000 },
      { name: 'ECOCA MT-208/500 CNC Torna', value: 68300 },
    ];
    const wonReasonsList = ['Fiyat avantajı', 'Hızlı teslimat', 'Servis ağı ve teknik destek', 'Mevcut müşteri ilişkisi'];
    const lostCodes = ['price', 'competitor', 'timing', 'spec', 'no_budget'];
    const openStages = [quoteStageId, salesStageId, visitStageId];

    const yearPlan = [
      { year: 2024, won: 3, lost: 2, open: 1 },
      { year: 2025, won: 4, lost: 3, open: 2 },
      { year: 2026, won: 5, lost: 4, open: 3 },
    ];

    const oppRows: (typeof schema.opportunities.$inferInsert)[] = [];
    let seq = 0;
    const pushOpp = (year: number, outcome: 'won' | 'lost' | 'open') => {
      const m = machines[seq % machines.length];
      const company = oppCompanies[seq % oppCompanies.length];
      const month = (seq * 5) % 12;
      const value = m.value * (0.85 + (seq % 6) * 0.05);
      const createdAt = new Date(Date.UTC(year, month, 6 + (seq % 18)));
      const row: typeof schema.opportunities.$inferInsert = {
        tenantId: tenantRow.id,
        companyId: company.id,
        ownerUserId: sales?.id ?? null,
        title: `${company.shortName ?? 'Müşteri'} — ${m.name}`,
        currentStageId:
          outcome === 'won'
            ? (seq % 3 === 0 ? contractId : deliveredId)!
            : outcome === 'lost'
              ? cancelledId!
              : openStages[seq % openStages.length]!,
        estimatedValue: value.toFixed(2),
        currencyId: usd?.id ?? null,
        probability: outcome === 'won' ? 100 : outcome === 'lost' ? 0 : 50,
        createdAt,
      };
      if (outcome === 'won') row.wonReason = wonReasonsList[seq % wonReasonsList.length];
      if (outcome === 'lost') {
        row.lostReasonId = reasonByCode.get(lostCodes[seq % lostCodes.length]) ?? null;
        if (seq % 2 === 0 && compIds.length) row.lostCompetitorId = compIds[seq % compIds.length];
      }
      oppRows.push(row);
      seq++;
    };
    for (const yp of yearPlan) {
      for (let i = 0; i < yp.won; i++) pushOpp(yp.year, 'won');
      for (let i = 0; i < yp.lost; i++) pushOpp(yp.year, 'lost');
      for (let i = 0; i < yp.open; i++) pushOpp(yp.year, 'open');
    }
    await db.insert(schema.opportunities).values(oppRows);
    console.log(`[demo] opportunities: +${oppRows.length} (won/lost/open, 2024-2026, reasons + competitors)`);
  }

  // 9c. Durumu çeşitli teklifler (fiyat ortalamaları / teklif durumu kırılımı için)
  const reportQuoteStatuses = ['approved', 'rejected', 'expired', 'sent'] as const;
  const statusIdByCode = new Map<string, string | undefined>();
  for (const c of reportQuoteStatuses) {
    statusIdByCode.set(c, (await db.query.quoteStatuses.findFirst({ where: eq(schema.quoteStatuses.code, c) }))?.id);
  }
  const quoteMachines = [
    { modelCode: 'DL-2112', base: 191000 },
    { modelCode: 'MV-1050', base: 81810 },
    { modelCode: 'MT-208/500', base: 74588 },
  ];
  const quoteCompanies = [kilitsan, contra, alipler].filter((c): c is NonNullable<typeof c> => !!c);
  let qSeq = 0;
  for (const yr of [2024, 2025, 2026]) {
    for (let i = 0; i < 4; i++) {
      const m = quoteMachines[qSeq % quoteMachines.length];
      const company = quoteCompanies[qSeq % quoteCompanies.length];
      const status = reportQuoteStatuses[i % reportQuoteStatuses.length];
      const documentNo = `RPT-${yr}-${String(i + 1).padStart(2, '0')}`;
      qSeq++;
      const exists = await db.query.quotes.findFirst({
        where: and(eq(schema.quotes.tenantId, tenantRow.id), eq(schema.quotes.documentNo, documentNo)),
      });
      if (exists) continue;
      const model = await db.query.productModels.findFirst({
        where: and(eq(schema.productModels.tenantId, tenantRow.id), eq(schema.productModels.modelCode, m.modelCode)),
      });
      if (!model) continue;
      const unitPrice = m.base * (0.92 + (qSeq % 4) * 0.04);
      const discount = unitPrice * 0.06;
      const grandTotal = unitPrice - discount;
      const quoteDate = new Date(Date.UTC(yr, (qSeq * 3) % 12, 12));
      const [quote] = await db
        .insert(schema.quotes)
        .values({
          tenantId: tenantRow.id,
          companyId: company.id,
          documentNo,
          quoteDate,
          validityDays: 30,
          projectOwnerUserId: sales?.id,
          currencyId: usd?.id,
          subtotal: grandTotal.toFixed(4),
          discountTotal: discount.toFixed(4),
          vatRate: '0.00',
          vatAmount: '0.0000',
          grandTotal: grandTotal.toFixed(4),
          statusId: statusIdByCode.get(status),
          approvedAt: status === 'approved' ? quoteDate : null,
          rejectedAt: status === 'rejected' ? quoteDate : null,
          createdBy: sales?.id,
        })
        .returning();
      await db.insert(schema.quoteItems).values({
        tenantId: tenantRow.id,
        quoteId: quote.id,
        productModelId: model.id,
        description: model.fullName,
        quantity: '1',
        unitId: adetUnit?.id,
        unitPrice: unitPrice.toFixed(4),
        discountAmount: discount.toFixed(4),
        vatRate: '0.00',
        vatAmount: '0.0000',
        lineTotal: grandTotal.toFixed(4),
        sortOrder: 0,
      });
    }
  }
  console.log('[demo] report quotes: varied statuses across 2024-2026');

  // 10. Warehouses + sample inventory items
  const existingWarehouse = await db.query.warehouses.findFirst({
    where: and(eq(schema.warehouses.tenantId, tenantRow.id), eq(schema.warehouses.name, 'Merkez Depo')),
  });
  if (!existingWarehouse) {
    const [wh] = await db
      .insert(schema.warehouses)
      .values({
        tenantId: tenantRow.id,
        name: 'Merkez Depo',
        type: 'main',
        country: 'Türkiye',
        province: 'İstanbul',
        district: 'Tuzla',
        address: 'Organize Sanayi Bölgesi, Tuzla, İstanbul',
      })
      .returning();
    const avail = await db.query.inventoryStatuses.findFirst({
      where: eq(schema.inventoryStatuses.code, 'available'),
    });
    const atWarehouse = await db.query.stockLocationStatuses.findFirst({
      where: eq(schema.stockLocationStatuses.code, 'at_warehouse'),
    });
    const dl = await db.query.productModels.findFirst({
      where: and(eq(schema.productModels.tenantId, tenantRow.id), eq(schema.productModels.modelCode, 'DL-2112')),
    });
    const mv = await db.query.productModels.findFirst({
      where: and(eq(schema.productModels.tenantId, tenantRow.id), eq(schema.productModels.modelCode, 'MV-1050')),
    });
    if (dl) {
      await db.insert(schema.inventoryItems).values({
        tenantId: tenantRow.id,
        productModelId: dl.id,
        serialNumber: 'MFD-DL2112-0001',
        controlUnit: 'Fanuc 0i-MF Plus',
        controlUnitSerialNumber: 'FNC-0001',
        warehouseId: wh.id,
        locationStatusId: atWarehouse?.id,
        stockStatusId: avail?.id,
        arrivalDate: new Date('2026-03-15'),
      });
    }
    if (mv) {
      await db.insert(schema.inventoryItems).values({
        tenantId: tenantRow.id,
        productModelId: mv.id,
        serialNumber: 'LK-MV1050-0007',
        controlUnit: 'Siemens 828D',
        controlUnitSerialNumber: 'SIE-0007',
        warehouseId: wh.id,
        locationStatusId: atWarehouse?.id,
        stockStatusId: avail?.id,
        arrivalDate: new Date('2026-04-10'),
      });
    }
    console.log(`[demo] warehouse + 2 inventory items`);
  }

  // 11. Installations (saha kurulum operasyonları)
  const serviceUser = await db.query.users.findFirst({
    where: and(eq(schema.users.tenantId, tenantRow.id), eq(schema.users.email, 'service@haksan.local')),
  });
  const instStatus = async (code: string) =>
    (await db.query.installationStatuses.findFirst({ where: eq(schema.installationStatuses.code, code) }))?.id;
  const [scheduledId, inProgressId, completedId] = await Promise.all([
    instStatus('scheduled'),
    instStatus('in_progress'),
    instStatus('completed'),
  ]);

  const installationDefs = [
    { companyId: kilitsan?.id, statusId: scheduledId, scheduledDate: new Date('2026-06-20'), location: 'Hendek, Sakarya', notes: 'MANFORD DL-2112 köprü tipi işleme merkezi kurulumu ve devreye alma.' },
    { companyId: contra?.id, statusId: inProgressId, scheduledDate: new Date('2026-06-05'), startedAt: new Date('2026-06-05'), location: 'İkitelli OSB, İstanbul', notes: 'LK MV-1050 dik işleme merkezi kurulumu — elektrik bağlantısı yapılıyor.' },
    { companyId: alipler?.id, statusId: completedId, scheduledDate: new Date('2026-04-12'), startedAt: new Date('2026-04-12'), completedAt: new Date('2026-04-15'), location: 'Nilüfer OSB, Bursa', notes: 'ECOCA MT-208/500 CNC torna kurulumu tamamlandı, operatör eğitimi verildi.' },
    { companyId: kilitsan?.id, statusId: scheduledId, scheduledDate: new Date('2026-07-02'), location: 'Hendek, Sakarya', notes: 'Periyodik bakım ve kalibrasyon ziyareti.' },
  ];

  const existingInstall = await db.query.installationJobs.findFirst({
    where: eq(schema.installationJobs.tenantId, tenantRow.id),
  });
  if (!existingInstall) {
    for (const inst of installationDefs) {
      if (!inst.companyId) continue;
      await db.insert(schema.installationJobs).values({
        tenantId: tenantRow.id,
        companyId: inst.companyId,
        assignedToUserId: serviceUser?.id,
        statusId: inst.statusId,
        scheduledDate: inst.scheduledDate,
        startedAt: inst.startedAt,
        completedAt: inst.completedAt,
        location: inst.location,
        notes: inst.notes,
      });
    }
    console.log(`[demo] installations: +${installationDefs.length}`);
  }

  console.log('[demo] all seeds applied.');
}

if (require.main === module) {
  seedDemo()
    .then(() => closeDb())
    .catch((err) => {
      console.error('[demo] failed:', err);
      process.exit(1);
    });
}
