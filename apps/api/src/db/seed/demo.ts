/**
 * GELİŞTİRME / CI — örnek tenant, kullanıcılar ve iş verisi.
 * Canlı ortamda ÇALIŞTIRMAYIN. Production: db:seed + db:bootstrap (sıfır iş verisi).
 * Run AFTER seedLookups() because it joins on lookup codes.
 */
import { hashPassword } from '../../shared/security/password';
import { eq, and, isNull } from 'drizzle-orm';
import { getDb, closeDb, schema } from '../client';
import { allRoles, rolePermissionMatrix } from './_data';
import { seedLookups } from './lookups';
import { PERMISSION_RESOURCES } from '@haksan/shared';
import { normalizeCompanyName } from '../../shared/utils/text-normalization';

const DEFAULT_SCOPE_RESOURCES = PERMISSION_RESOURCES.filter(
  (resource) => !['tenants', 'users', 'roles', 'departments', 'divisions', 'audit', 'files'].includes(resource)
);

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
  const departmentsByCode = new Map(
    (await db.query.departments.findMany({ where: eq(schema.departments.tenantId, tenantRow.id) })).map((d) => [d.code, d])
  );

  // 3b. Divisions / commercial areas (CNC, Universal, Sac Isleme)
  const divisionDefs = [
    { code: 'cnc', name: 'CNC', description: 'CNC tezgah ve otomasyon satışları', sortOrder: 10 },
    { code: 'universal', name: 'Üniversal', description: 'Üniversal torna, freze ve yardımcı ekipman', sortOrder: 20 },
    { code: 'sac_isleme', name: 'Sac İşleme', description: 'Abkant, giyotin ve sac işleme hatları', sortOrder: 30 },
  ];
  for (const d of divisionDefs) {
    const existing = await db.query.divisions.findFirst({
      where: and(eq(schema.divisions.tenantId, tenantRow.id), eq(schema.divisions.code, d.code)),
    });
    if (!existing) {
      await db.insert(schema.divisions).values({ tenantId: tenantRow.id, ...d });
      console.log(`[demo] division: ${d.name}`);
    }
  }
  const divisionsByCode = new Map(
    (await db.query.divisions.findMany({ where: eq(schema.divisions.tenantId, tenantRow.id) })).map((d) => [d.code, d])
  );
  const defaultDivision = divisionsByCode.get('cnc') ?? divisionsByCode.values().next().value;
  const allDivisionCodes = divisionDefs.map((d) => d.code);

  // 4. Users
  const userDefs = [
    { email: 'superadmin@haksan.local', fullName: 'Süper Yönetici', password: 'superadmin12345', roles: ['super_admin'], departmentCode: 'sales', divisionCodes: allDivisionCodes },
    { email: 'admin@haksan.local', fullName: 'Sistem Yöneticisi', password: 'admin12345', roles: ['admin'], departmentCode: 'sales', divisionCodes: allDivisionCodes },
    { email: 'sales@haksan.local', fullName: 'Ersin Çetinbilek', password: 'sales12345', roles: ['sales'], departmentCode: 'sales', divisionCodes: allDivisionCodes },
    { email: 'service@haksan.local', fullName: 'Servis Sorumlusu', password: 'service12345', roles: ['service'], departmentCode: 'service', divisionCodes: allDivisionCodes },
    { email: 'finance@haksan.local', fullName: 'Finans Sorumlusu', password: 'finance12345', roles: ['finance'], departmentCode: 'finance', divisionCodes: allDivisionCodes },
    { email: 'stock@haksan.local', fullName: 'Stok Sorumlusu', password: 'stock12345', roles: ['stock'], departmentCode: 'stock', divisionCodes: allDivisionCodes },
    { email: 'readonly@haksan.local', fullName: 'Salt Okunur Kullanıcı', password: 'readonly12345', roles: ['readonly'], departmentCode: 'sales', divisionCodes: allDivisionCodes },
  ];
  for (const u of userDefs) {
    const existing = await db.query.users.findFirst({
      where: and(eq(schema.users.tenantId, tenantRow.id), eq(schema.users.email, u.email)),
    });
    const dept = departmentsByCode.get(u.departmentCode) ?? salesDept;
    const user =
      existing ??
      (
        await db
          .insert(schema.users)
          .values({
            tenantId: tenantRow.id,
            departmentId: dept?.id ?? null,
            fullName: u.fullName,
            email: u.email,
            passwordHash: await hashPassword(u.password),
          })
          .returning()
      )[0];
    if (existing && dept && existing.departmentId !== dept.id) {
      await db.update(schema.users).set({ departmentId: dept.id }).where(eq(schema.users.id, existing.id));
    }
    for (const roleCode of u.roles) {
      const role = rolesByCode.get(roleCode);
      if (role) {
        await db
          .insert(schema.userRoles)
          .values({ userId: user.id, roleId: role.id })
          .onConflictDoNothing();
      }
    }
    if (dept) {
      await db
        .insert(schema.userDepartmentAssignments)
        .values({ userId: user.id, departmentId: dept.id, isPrimary: true })
        .onConflictDoNothing();
    }
    for (const [index, code] of u.divisionCodes.entries()) {
      const division = divisionsByCode.get(code);
      if (!division) continue;
      await db
        .insert(schema.userDivisions)
        .values({ userId: user.id, divisionId: division.id, isPrimary: index === 0 })
        .onConflictDoNothing();
    }
    const canViewAll = u.roles.some((role) => role === 'super_admin' || role === 'admin');
    const hasEveryDemoDivision = allDivisionCodes.every((code) => u.divisionCodes.includes(code));
    const canUseAllDivisionScope = canViewAll || hasEveryDemoDivision;
    const accessScopeRows = canUseAllDivisionScope
      ? DEFAULT_SCOPE_RESOURCES.map((resource) => ({
          tenantId: tenantRow.id,
          userId: user.id,
          resource,
          departmentId: dept?.id ?? null,
          divisionId: null,
          isPrimary: true,
        }))
      : DEFAULT_SCOPE_RESOURCES.flatMap((resource) =>
          u.divisionCodes
            .map((code, index) => {
              const division = divisionsByCode.get(code);
              if (!division) return null;
              return {
                tenantId: tenantRow.id,
                userId: user.id,
                resource,
                departmentId: dept?.id ?? null,
                divisionId: division.id,
                isPrimary: index === 0,
              };
            })
            .filter((row): row is NonNullable<typeof row> => !!row)
        );
    if (accessScopeRows.length) {
      await db.insert(schema.userAccessScopes).values(accessScopeRows).onConflictDoNothing();
    }
    if (!existing) console.log(`[demo] user: ${u.email} / ${u.password}`);
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
  type CompanySeedDef = {
    id?: string;
    legalTitle: string;
    shortName: string;
    relationCode: string;
    statusCode: string;
    sector: string;
    taxNumber: string;
    address?: string;
    province?: string;
    district?: string;
    locality?: string;
    street?: string;
    buildingNumber?: string;
    phone?: string;
    email?: string;
    divisionCodes?: string[];
  };

  const companyDefs: CompanySeedDef[] = [
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
      divisionCodes: ['cnc'],
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
      divisionCodes: ['cnc'],
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
      divisionCodes: ['cnc'],
    },
    {
      id: '0f8d8632-6b0a-4f3d-9a56-61b70e7a1001',
      legalTitle: 'BAYRAMPAŞA KOCATEPE CNC TEST LTD. ŞTİ.',
      shortName: 'BAYPA TEST KOCATEPE',
      relationCode: 'customer',
      statusCode: 'potential',
      sector: 'CNC Talaşlı İmalat',
      taxNumber: '5550004444',
      address: 'Kocatepe Mahallesi, Bayrampaşa, İstanbul',
      province: 'İstanbul',
      district: 'Bayrampaşa',
      locality: 'Kocatepe',
      phone: '+90 212 000 00 04',
      email: 'kocatepe-test@haksan.local',
      divisionCodes: ['cnc'],
    },
    {
      id: '0f8d8632-6b0a-4f3d-9a56-61b70e7a1002',
      legalTitle: 'BAYRAMPAŞA İSMETPAŞA MAKİNE TEST A.Ş.',
      shortName: 'BAYPA TEST İSMETPAŞA',
      relationCode: 'customer',
      statusCode: 'active',
      sector: 'Makine Bakım ve Servis',
      taxNumber: '5550005555',
      address: 'İsmetpaşa Mahallesi, Bayrampaşa, İstanbul',
      province: 'İstanbul',
      district: 'Bayrampaşa',
      locality: 'İsmetpaşa',
      phone: '+90 212 000 00 05',
      email: 'ismetpasa-test@haksan.local',
      divisionCodes: ['cnc'],
    },
    {
      legalTitle: 'UNIMAK ÜNİVERSAL TEZGAH SAN. A.Ş.',
      shortName: 'UNIMAK',
      relationCode: 'customer',
      statusCode: 'active',
      sector: 'Üniversal Torna & Freze',
      taxNumber: '5550006666',
      address: 'İvedik OSB, Yenimahalle, Ankara',
      province: 'Ankara',
      district: 'Yenimahalle',
      phone: '+90 312 000 00 06',
      email: 'satinalma@unimak.local',
      divisionCodes: ['universal'],
    },
    {
      legalTitle: 'SACTECH METAL İŞLEME SAN. LTD. ŞTİ.',
      shortName: 'SACTECH',
      relationCode: 'customer',
      statusCode: 'potential',
      sector: 'Sac İşleme',
      taxNumber: '5550007777',
      address: 'Nilüfer Organize Sanayi Bölgesi, Bursa',
      province: 'Bursa',
      district: 'Nilüfer',
      phone: '+90 224 000 00 07',
      email: 'info@sactech.local',
      divisionCodes: ['sac_isleme'],
    },
    {
      legalTitle: 'TAIWAN MACHINE SUPPLY CO. LTD.',
      shortName: 'Taiwan Machine Supply',
      relationCode: 'supplier',
      statusCode: 'active',
      sector: 'Makine Tedarik',
      taxNumber: '5550008888',
      address: 'Taichung Industrial Zone, Taiwan',
      phone: '+886 4 0000 0008',
      email: 'orders@tw-machines.local',
      divisionCodes: allDivisionCodes,
    },
  ];

  const relTypeMap = new Map<string, string>();
  for (const c of ['customer', 'supplier', 'supplier_customer', 'competitor']) {
    const id = await lookupId('companyRelationTypes', c);
    if (id) relTypeMap.set(c, id);
  }
  const statusMap = new Map<string, string>();
  for (const s of ['potential', 'active', 'passive', 'blacklist']) {
    const id = await lookupId('companyStatuses', s);
    if (id) statusMap.set(s, id);
  }

  for (const c of companyDefs) {
    const legalTitle = normalizeCompanyName(c.legalTitle);
    const shortName = normalizeCompanyName(c.shortName);
    const existing = await db.query.companies.findFirst({
      where: and(
        eq(schema.companies.tenantId, tenantRow.id),
        eq(schema.companies.taxNumber, c.taxNumber),
        isNull(schema.companies.deletedAt)
      ),
    });
    const company =
      existing ??
      (
        await db
          .insert(schema.companies)
          .values({
            ...(c.id ? { id: c.id } : {}),
            tenantId: tenantRow.id,
            companyType: 'company',
            relationTypeId: relTypeMap.get(c.relationCode),
            customerStatusId: statusMap.get(c.statusCode),
            legalTitle,
            shortName,
            sector: c.sector,
            taxNumber: c.taxNumber,
          })
          .returning()
      )[0];
    if (!existing) {
      if (c.address) {
        await db.insert(schema.companyAddresses).values({
          tenantId: tenantRow.id,
          companyId: company.id,
          addressType: 'billing',
          country: 'Türkiye',
          province: c.province ?? null,
          district: c.district ?? null,
          locality: c.locality ?? null,
          street: c.street ?? null,
          buildingNumber: c.buildingNumber ?? null,
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
    for (const code of c.divisionCodes ?? ['cnc']) {
      const division = divisionsByCode.get(code);
      if (!division) continue;
      await db
        .insert(schema.companyDivisions)
        .values({ tenantId: tenantRow.id, companyId: company.id, divisionId: division.id })
        .onConflictDoNothing();
    }
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
      eq(schema.companies.legalTitle, 'CONTRA MAKİNE SAN. VE TİC. LTD. ŞTİ.')
    ),
  });
  const alipler = await db.query.companies.findFirst({
    where: and(eq(schema.companies.tenantId, tenantRow.id), eq(schema.companies.legalTitle, 'ALİŞLER MAKİNA')),
  });
  const unimak = await db.query.companies.findFirst({
    where: and(eq(schema.companies.tenantId, tenantRow.id), eq(schema.companies.legalTitle, 'UNIMAK ÜNİVERSAL TEZGAH SAN. A.Ş.')),
  });
  const sactech = await db.query.companies.findFirst({
    where: and(eq(schema.companies.tenantId, tenantRow.id), eq(schema.companies.legalTitle, 'SACTECH METAL İŞLEME SAN. LTD. ŞTİ.')),
  });
  const taiwanSupplier = await db.query.companies.findFirst({
    where: and(eq(schema.companies.tenantId, tenantRow.id), eq(schema.companies.legalTitle, 'TAIWAN MACHINE SUPPLY CO. LTD.')),
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
    {
      companyId: unimak?.id,
      fullName: 'Ayşe Demir',
      mobilePhone: '+90 532 000 00 06',
      isPrimary: true,
    },
    {
      companyId: sactech?.id,
      fullName: 'Murat Kaya',
      mobilePhone: '+90 532 000 00 07',
      isPrimary: true,
    },
    {
      companyId: taiwanSupplier?.id,
      fullName: 'Lin Wei',
      mobilePhone: '+886 900 000 008',
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
  const universalGroup = await db.query.productGroups.findFirst({ where: eq(schema.productGroups.code, 'UNIVERSAL') });
  const sacGroup = await db.query.productGroups.findFirst({ where: eq(schema.productGroups.code, 'SAC_ISLEME') });
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
      groupId: cncGroup?.id,
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
      groupId: cncGroup?.id,
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
      groupId: cncGroup?.id,
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
    {
      brand: 'Haksan',
      groupId: universalGroup?.id,
      modelCode: 'UF-560',
      fullName: 'HAKSAN UF-560 Üniversal Freze Tezgahı',
      modelName: 'UF-560',
      typeId: null,
      subId: tornaSub?.id,
      image: 'https://images.unsplash.com/photo-1581092795360-fd1ca04f0952?w=800',
      listPrice: '18500.0000',
      cashPrice: '17200.0000',
      vatRate: '20',
      specs: [
        ['TABLA', 'Tabla Ölçüsü', '1.370 x 320', 'mm'],
        ['EKSENLER', 'X Eksen Hareketi', '900', 'mm'],
        ['EKSENLER', 'Y Eksen Hareketi', '380', 'mm'],
        ['EKSENLER', 'Z Eksen Hareketi', '450', 'mm'],
        ['FENER_MILI', 'Fener Mili Devri', '60 - 4.200', 'dv/dk'],
        ['GENEL', 'Ağırlık', '2.100', 'kg'],
      ],
    },
    {
      brand: 'Haksan',
      groupId: sacGroup?.id,
      modelCode: 'HPB-30135',
      fullName: 'HAKSAN HPB-30135 CNC Abkant Pres',
      modelName: 'HPB-30135',
      typeId: null,
      subId: null,
      image: 'https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?w=800',
      listPrice: '43800.0000',
      cashPrice: '40500.0000',
      vatRate: '20',
      specs: [
        ['KAPASITE', 'Büküm Boyu', '3.100', 'mm'],
        ['KAPASITE', 'Baskı Gücü', '135', 'ton'],
        ['EKSENLER', 'Y1/Y2 Eksen Kontrolü', 'Standart', ''],
        ['MOTORLAR', 'Ana Motor Gücü', '11', 'kw'],
        ['GENEL', 'Ağırlık', '8.200', 'kg'],
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
        productGroupId: p.groupId ?? cncGroup?.id,
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
      divisionCode: 'cnc',
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
      divisionCode: 'cnc',
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
      divisionCode: 'cnc',
      documentNo: '2023/089',
      quoteDate: new Date('2023-05-12'),
      validityDays: 5,
      qty: '1',
      unitPrice: '74588.0000',
      discount: '6288.0000',
      vatRate: '8',
      currency: 'USD',
    },
    {
      companyId: unimak?.id,
      modelCode: 'UF-560',
      divisionCode: 'universal',
      documentNo: '2026/UNI-01',
      quoteDate: new Date('2026-06-03'),
      validityDays: 15,
      qty: '1',
      unitPrice: '18500.0000',
      discount: '1300.0000',
      vatRate: '20',
      currency: 'USD',
    },
    {
      companyId: sactech?.id,
      modelCode: 'HPB-30135',
      divisionCode: 'sac_isleme',
      documentNo: '2026/SAC-01',
      quoteDate: new Date('2026-06-08'),
      validityDays: 20,
      qty: '1',
      unitPrice: '43800.0000',
      discount: '3300.0000',
      vatRate: '20',
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
        divisionId: divisionsByCode.get(q.divisionCode)?.id ?? defaultDivision?.id ?? null,
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
      divisionId: divisionsByCode.get(q.divisionCode)?.id ?? defaultDivision?.id ?? null,
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
    const oppCompanyPlans = [
      { company: kilitsan, divisionCode: 'cnc' },
      { company: contra, divisionCode: 'cnc' },
      { company: alipler, divisionCode: 'cnc' },
      { company: unimak, divisionCode: 'universal' },
      { company: sactech, divisionCode: 'sac_isleme' },
    ].filter((c): c is { company: NonNullable<typeof kilitsan>; divisionCode: string } => !!c.company);
    const machines = [
      { name: 'MANFORD DL-2112 İşleme Merkezi', value: 170000 },
      { name: 'LK MV-1050 Dik İşleme Merkezi', value: 72000 },
      { name: 'ECOCA MT-208/500 CNC Torna', value: 68300 },
      { name: 'HAKSAN UF-560 Üniversal Freze', value: 17200 },
      { name: 'HAKSAN HPB-30135 Abkant Pres', value: 40500 },
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
      const plan = oppCompanyPlans[seq % oppCompanyPlans.length];
      const company = plan.company;
      const month = (seq * 5) % 12;
      const value = m.value * (0.85 + (seq % 6) * 0.05);
      const createdAt = new Date(Date.UTC(year, month, 6 + (seq % 18)));
      const row: typeof schema.opportunities.$inferInsert = {
        tenantId: tenantRow.id,
        companyId: company.id,
        divisionId: divisionsByCode.get(plan.divisionCode)?.id ?? defaultDivision?.id ?? null,
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
    { modelCode: 'DL-2112', base: 191000, divisionCode: 'cnc' },
    { modelCode: 'MV-1050', base: 81810, divisionCode: 'cnc' },
    { modelCode: 'MT-208/500', base: 74588, divisionCode: 'cnc' },
    { modelCode: 'UF-560', base: 18500, divisionCode: 'universal' },
    { modelCode: 'HPB-30135', base: 43800, divisionCode: 'sac_isleme' },
  ];
  const quoteCompanies = [kilitsan, contra, alipler, unimak, sactech].filter((c): c is NonNullable<typeof c> => !!c);
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
          divisionId: divisionsByCode.get(m.divisionCode)?.id ?? defaultDivision?.id ?? null,
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
        divisionId: divisionsByCode.get(m.divisionCode)?.id ?? defaultDivision?.id ?? null,
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

  // 9d. Sales activities, visits and calls (dashboard + activity reports)
  const demoActivityExists = await db.query.salesActivities.findFirst({
    where: and(eq(schema.salesActivities.tenantId, tenantRow.id), eq(schema.salesActivities.subject, 'Demo CNC teklif takip araması')),
  });
  if (!demoActivityExists) {
    const activityType = async (code: string) =>
      (await db.query.activityTypes.findFirst({ where: eq(schema.activityTypes.code, code) }))?.id;
    const [callTypeId, visitTypeId, demoTypeId] = await Promise.all([
      activityType('call'),
      activityType('visit'),
      activityType('demo'),
    ]);
    const activityOpps = await db.query.opportunities.findMany({
      where: eq(schema.opportunities.tenantId, tenantRow.id),
      limit: 5,
    });
    const activityRows: (typeof schema.salesActivities.$inferInsert)[] = [];
    const visitRows: (typeof schema.visits.$inferInsert)[] = [];
    const callRows: (typeof schema.calls.$inferInsert)[] = [];
    for (const [index, opp] of activityOpps.entries()) {
      const typeId = index % 3 === 0 ? demoTypeId : index % 2 === 0 ? visitTypeId : callTypeId;
      if (!typeId) continue;
      activityRows.push({
        tenantId: tenantRow.id,
        divisionId: opp.divisionId ?? defaultDivision?.id ?? null,
        opportunityId: opp.id,
        companyId: opp.companyId,
        activityTypeId: typeId,
        subject:
          index === 0
            ? 'Demo CNC teklif takip araması'
            : index % 3 === 0
              ? 'Demo makine sunumu'
              : index % 2 === 0
                ? 'Demo saha ziyareti'
                : 'Demo ihtiyaç analizi görüşmesi',
        description: 'Demo veri: satış ekibi tarafından oluşturulan takip aktivitesi.',
        activityDate: new Date(Date.UTC(2026, index + 1, 10 + index)),
        nextFollowUpAt: new Date(Date.UTC(2026, index + 1, 17 + index)),
        result: 'Müşteri teknik şartname ve termin bilgisini bekliyor.',
        createdBy: sales?.id ?? null,
      });
      if (index % 2 === 0) {
        visitRows.push({
          tenantId: tenantRow.id,
          divisionId: opp.divisionId ?? defaultDivision?.id ?? null,
          opportunityId: opp.id,
          companyId: opp.companyId,
          visitDate: new Date(Date.UTC(2026, index + 1, 11 + index)),
          visitLocation: 'Müşteri tesisi',
          visitPurpose: 'Makine yerleşimi ve elektrik altyapısı kontrolü.',
          visitResult: 'Yerleşim uygun, teklif revizyonu istenecek.',
          nextAction: 'Revize teknik teklif gönderilecek.',
          createdBy: sales?.id ?? null,
        });
      } else {
        callRows.push({
          tenantId: tenantRow.id,
          divisionId: opp.divisionId ?? defaultDivision?.id ?? null,
          opportunityId: opp.id,
          companyId: opp.companyId,
          callDate: new Date(Date.UTC(2026, index + 1, 12 + index)),
          callResult: 'Bütçe onayı bekleniyor.',
          nextAction: 'Finansman alternatifi paylaşılacak.',
          createdBy: sales?.id ?? null,
        });
      }
    }
    if (activityRows.length) await db.insert(schema.salesActivities).values(activityRows);
    if (visitRows.length) await db.insert(schema.visits).values(visitRows);
    if (callRows.length) await db.insert(schema.calls).values(callRows);
    console.log(`[demo] activities: +${activityRows.length}, visits: +${visitRows.length}, calls: +${callRows.length}`);
  }

  // 10. Warehouses + sample inventory items
  const existingWarehouse = await db.query.warehouses.findFirst({
    where: and(eq(schema.warehouses.tenantId, tenantRow.id), eq(schema.warehouses.name, 'Merkez Depo')),
  });
  const warehouse =
    existingWarehouse ??
    (
      await db
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
        .returning()
    )[0];
  if (!existingWarehouse) console.log('[demo] warehouse: Merkez Depo');

  const inventoryStatusRows = await db.query.inventoryStatuses.findMany();
  const inventoryStatusByCode = new Map(inventoryStatusRows.map((s) => [s.code, s.id]));
  const locationStatusRows = await db.query.stockLocationStatuses.findMany();
  const locationStatusByCode = new Map(locationStatusRows.map((s) => [s.code, s.id]));

  const ensureInventoryItem = async (def: {
    modelCode: string;
    serialNumber: string;
    controlUnit: string;
    controlUnitSerialNumber: string;
    statusCode: string;
    locationCode: string;
    divisionCode: string;
    arrivalDate?: Date;
    loadingDate?: Date;
    reservedCompanyId?: string | null;
    notes?: string;
  }) => {
    const model = await db.query.productModels.findFirst({
      where: and(eq(schema.productModels.tenantId, tenantRow.id), eq(schema.productModels.modelCode, def.modelCode)),
    });
    if (!model) return undefined;
    const existing = await db.query.inventoryItems.findFirst({
      where: and(eq(schema.inventoryItems.tenantId, tenantRow.id), eq(schema.inventoryItems.serialNumber, def.serialNumber)),
    });
    const values = {
      tenantId: tenantRow.id,
      divisionId: divisionsByCode.get(def.divisionCode)?.id ?? defaultDivision?.id ?? null,
      productModelId: model.id,
      serialNumber: def.serialNumber,
      controlUnit: def.controlUnit,
      controlUnitSerialNumber: def.controlUnitSerialNumber,
      warehouseId: warehouse.id,
      locationStatusId: locationStatusByCode.get(def.locationCode) ?? null,
      stockStatusId: inventoryStatusByCode.get(def.statusCode) ?? null,
      arrivalDate: def.arrivalDate ?? null,
      loadingDate: def.loadingDate ?? null,
      reservedCompanyId: def.reservedCompanyId ?? null,
      reservedAt: def.reservedCompanyId ? new Date('2026-06-01') : null,
      notes: def.notes ?? null,
    };
    if (existing) {
      await db.update(schema.inventoryItems).set(values).where(eq(schema.inventoryItems.id, existing.id));
      return { ...existing, ...values };
    }
    const [created] = await db.insert(schema.inventoryItems).values(values).returning();
    return created;
  };

  const inventoryDefs = [
    { modelCode: 'DL-2112', serialNumber: 'MFD-DL2112-0001', controlUnit: 'Fanuc 0i-MF Plus', controlUnitSerialNumber: 'FNC-0001', statusCode: 'available', locationCode: 'at_warehouse', divisionCode: 'cnc', arrivalDate: new Date('2026-03-15') },
    { modelCode: 'DL-2112', serialNumber: 'MFD-DL2112-0002', controlUnit: 'Fanuc 0i-MF Plus', controlUnitSerialNumber: 'FNC-0002', statusCode: 'sold', locationCode: 'at_customer', divisionCode: 'cnc', arrivalDate: new Date('2025-10-22') },
    { modelCode: 'MV-1050', serialNumber: 'LK-MV1050-0007', controlUnit: 'Siemens 828D', controlUnitSerialNumber: 'SIE-0007', statusCode: 'available', locationCode: 'at_warehouse', divisionCode: 'cnc', arrivalDate: new Date('2026-04-10') },
    { modelCode: 'MV-1050', serialNumber: 'LK-MV1050-0008', controlUnit: 'Siemens 828D', controlUnitSerialNumber: 'SIE-0008', statusCode: 'sold', locationCode: 'at_customer', divisionCode: 'cnc', arrivalDate: new Date('2025-12-12') },
    { modelCode: 'MT-208/500', serialNumber: 'ECO-MT208-0003', controlUnit: 'Fanuc 0i-TF', controlUnitSerialNumber: 'FNC-T0003', statusCode: 'sold', locationCode: 'at_customer', divisionCode: 'cnc', arrivalDate: new Date('2025-09-18') },
    { modelCode: 'UF-560', serialNumber: 'UNI-UF560-0001', controlUnit: 'DRO 3 Axis', controlUnitSerialNumber: 'DRO-560-01', statusCode: 'sold', locationCode: 'at_customer', divisionCode: 'universal', arrivalDate: new Date('2025-11-04') },
    { modelCode: 'UF-560', serialNumber: 'UNI-UF560-0002', controlUnit: 'DRO 3 Axis', controlUnitSerialNumber: 'DRO-560-02', statusCode: 'reserved', locationCode: 'at_warehouse', divisionCode: 'universal', reservedCompanyId: unimak?.id ?? null, arrivalDate: new Date('2026-05-18') },
    { modelCode: 'HPB-30135', serialNumber: 'SAC-HPB30135-0001', controlUnit: 'Delem DA-66T', controlUnitSerialNumber: 'DLM-30135-01', statusCode: 'sold', locationCode: 'at_customer', divisionCode: 'sac_isleme', arrivalDate: new Date('2025-08-30') },
    { modelCode: 'HPB-30135', serialNumber: 'SAC-HPB30135-0002', controlUnit: 'Delem DA-66T', controlUnitSerialNumber: 'DLM-30135-02', statusCode: 'available', locationCode: 'at_warehouse', divisionCode: 'sac_isleme', arrivalDate: new Date('2026-05-24') },
  ];
  for (const item of inventoryDefs) {
    await ensureInventoryItem(item);
  }
  console.log(`[demo] inventory items: ${inventoryDefs.length} serial-numbered machines`);

  // 10b. Customer devices / installed machine assets
  const warrantyRows = await db.query.warrantyStatuses.findMany();
  const warrantyByCode = new Map(warrantyRows.map((s) => [s.code, s.id]));
  const quoteByNo = async (documentNo: string) =>
    await db.query.quotes.findFirst({
      where: and(eq(schema.quotes.tenantId, tenantRow.id), eq(schema.quotes.documentNo, documentNo)),
    });
  const firstOpportunityForCompany = async (companyId: string) =>
    await db.query.opportunities.findFirst({
      where: and(eq(schema.opportunities.tenantId, tenantRow.id), eq(schema.opportunities.companyId, companyId)),
    });
  const ensureCustomerDevice = async (def: {
    companyId?: string;
    serialNumber: string;
    quoteNo?: string;
    warrantyCode: string;
    saleDate: Date;
    deliveryDate: Date;
    installationDate: Date;
    warrantyStartDate: Date;
    warrantyEndDate: Date;
    notes: string;
  }) => {
    if (!def.companyId) return undefined;
    const item = await db.query.inventoryItems.findFirst({
      where: and(eq(schema.inventoryItems.tenantId, tenantRow.id), eq(schema.inventoryItems.serialNumber, def.serialNumber)),
    });
    if (!item) return undefined;
    const existing = await db.query.customerDevices.findFirst({
      where: and(eq(schema.customerDevices.tenantId, tenantRow.id), eq(schema.customerDevices.inventoryItemId, item.id)),
    });
    const quote = def.quoteNo ? await quoteByNo(def.quoteNo) : undefined;
    const opportunity = await firstOpportunityForCompany(def.companyId);
    const values = {
      tenantId: tenantRow.id,
      divisionId: item.divisionId ?? defaultDivision?.id ?? null,
      companyId: def.companyId,
      initialCompanyId: def.companyId,
      inventoryItemId: item.id,
      opportunityId: opportunity?.id ?? null,
      quoteId: quote?.id ?? null,
      saleDate: def.saleDate,
      deliveryDate: def.deliveryDate,
      installationDate: def.installationDate,
      warrantyStartDate: def.warrantyStartDate,
      warrantyEndDate: def.warrantyEndDate,
      statusId: warrantyByCode.get(def.warrantyCode) ?? null,
      notes: def.notes,
    };
    if (existing) {
      await db.update(schema.customerDevices).set(values).where(eq(schema.customerDevices.id, existing.id));
      return { ...existing, ...values };
    }
    const [created] = await db.insert(schema.customerDevices).values(values).returning();
    return created;
  };

  const deviceDefs = [
    { companyId: kilitsan?.id, serialNumber: 'MFD-DL2112-0002', quoteNo: '2026/16', warrantyCode: 'active', saleDate: new Date('2025-10-25'), deliveryDate: new Date('2025-11-02'), installationDate: new Date('2025-11-04'), warrantyStartDate: new Date('2025-11-04'), warrantyEndDate: new Date('2027-11-04'), notes: 'Demo kurulu CNC makine.' },
    { companyId: contra?.id, serialNumber: 'LK-MV1050-0008', quoteNo: '2026/040', warrantyCode: 'active', saleDate: new Date('2025-12-15'), deliveryDate: new Date('2025-12-21'), installationDate: new Date('2025-12-23'), warrantyStartDate: new Date('2025-12-23'), warrantyEndDate: new Date('2027-12-23'), notes: 'Demo kurulu dik işleme merkezi.' },
    { companyId: alipler?.id, serialNumber: 'ECO-MT208-0003', quoteNo: '2023/089', warrantyCode: 'expired', saleDate: new Date('2023-05-20'), deliveryDate: new Date('2023-06-02'), installationDate: new Date('2023-06-05'), warrantyStartDate: new Date('2023-06-05'), warrantyEndDate: new Date('2025-06-05'), notes: 'Garanti dışı demo servis varlığı.' },
    { companyId: unimak?.id, serialNumber: 'UNI-UF560-0001', quoteNo: '2026/UNI-01', warrantyCode: 'active', saleDate: new Date('2025-11-08'), deliveryDate: new Date('2025-11-15'), installationDate: new Date('2025-11-16'), warrantyStartDate: new Date('2025-11-16'), warrantyEndDate: new Date('2027-11-16'), notes: 'Üniversal alanı demo varlığı.' },
    { companyId: sactech?.id, serialNumber: 'SAC-HPB30135-0001', quoteNo: '2026/SAC-01', warrantyCode: 'active', saleDate: new Date('2025-09-04'), deliveryDate: new Date('2025-09-13'), installationDate: new Date('2025-09-15'), warrantyStartDate: new Date('2025-09-15'), warrantyEndDate: new Date('2027-09-15'), notes: 'Sac işleme alanı demo varlığı.' },
  ];
  for (const device of deviceDefs) {
    await ensureCustomerDevice(device);
  }
  console.log(`[demo] customer devices: ${deviceDefs.length} installed machines`);

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

  const installationDefs: Array<{
    companyId?: string;
    divisionCode: string;
    statusId?: string;
    scheduledDate: Date;
    startedAt?: Date;
    completedAt?: Date;
    location: string;
    locationType?: 'istanbul_ici' | 'istanbul_disi';
    durationMinutes?: number;
    notes: string;
  }> = [
    { companyId: kilitsan?.id, divisionCode: 'cnc', statusId: scheduledId, scheduledDate: new Date('2026-06-20'), location: 'Hendek, Sakarya', locationType: 'istanbul_disi', durationMinutes: 480, notes: 'MANFORD DL-2112 köprü tipi işleme merkezi kurulumu ve devreye alma.' },
    { companyId: contra?.id, divisionCode: 'cnc', statusId: inProgressId, scheduledDate: new Date('2026-06-05'), startedAt: new Date('2026-06-05'), location: 'İkitelli OSB, İstanbul', locationType: 'istanbul_ici', durationMinutes: 300, notes: 'LK MV-1050 dik işleme merkezi kurulumu — elektrik bağlantısı yapılıyor.' },
    { companyId: alipler?.id, divisionCode: 'cnc', statusId: completedId, scheduledDate: new Date('2026-04-12'), startedAt: new Date('2026-04-12'), completedAt: new Date('2026-04-15'), location: 'Nilüfer OSB, Bursa', locationType: 'istanbul_disi', durationMinutes: 960, notes: 'ECOCA MT-208/500 CNC torna kurulumu tamamlandı, operatör eğitimi verildi.' },
    { companyId: unimak?.id, divisionCode: 'universal', statusId: scheduledId, scheduledDate: new Date('2026-06-24'), location: 'İvedik OSB, Ankara', locationType: 'istanbul_disi', durationMinutes: 360, notes: 'HAKSAN UF-560 üniversal freze kurulumu ve hassasiyet kontrolü.' },
    { companyId: sactech?.id, divisionCode: 'sac_isleme', statusId: completedId, scheduledDate: new Date('2026-05-14'), startedAt: new Date('2026-05-14'), completedAt: new Date('2026-05-15'), location: 'Nilüfer OSB, Bursa', locationType: 'istanbul_disi', durationMinutes: 720, notes: 'HAKSAN HPB-30135 abkant pres kurulum ve operatör eğitimi.' },
    { companyId: kilitsan?.id, divisionCode: 'cnc', statusId: scheduledId, scheduledDate: new Date('2026-07-02'), location: 'Hendek, Sakarya', locationType: 'istanbul_disi', durationMinutes: 240, notes: 'Periyodik bakım ve kalibrasyon ziyareti.' },
  ];

  let createdInstallations = 0;
  for (const inst of installationDefs) {
    if (!inst.companyId) continue;
    const existing = await db.query.installationJobs.findFirst({
      where: and(eq(schema.installationJobs.tenantId, tenantRow.id), eq(schema.installationJobs.notes, inst.notes)),
    });
    if (existing) continue;
    await db.insert(schema.installationJobs).values({
      tenantId: tenantRow.id,
      divisionId: divisionsByCode.get(inst.divisionCode)?.id ?? defaultDivision?.id ?? null,
      companyId: inst.companyId,
      assignedToUserId: serviceUser?.id,
      statusId: inst.statusId,
      scheduledDate: inst.scheduledDate,
      startedAt: inst.startedAt,
      completedAt: inst.completedAt,
      location: inst.location,
      locationType: inst.locationType,
      durationMinutes: inst.durationMinutes,
      notes: inst.notes,
    });
    createdInstallations++;
  }
  if (createdInstallations) console.log(`[demo] installations: +${createdInstallations}`);

  // 12. Sales orders, purchase orders and commercial documents
  const stockUser = await db.query.users.findFirst({
    where: and(eq(schema.users.tenantId, tenantRow.id), eq(schema.users.email, 'stock@haksan.local')),
  });
  const financeUser = await db.query.users.findFirst({
    where: and(eq(schema.users.tenantId, tenantRow.id), eq(schema.users.email, 'finance@haksan.local')),
  });
  const rowsByCode = async <T extends { code: string; id: string }>(rows: Promise<T[]>) =>
    new Map((await rows).map((r) => [r.code, r.id]));
  const salesOrderStatusByCode = await rowsByCode(db.query.salesOrderStatuses.findMany());
  const purchaseOrderStatusByCode = await rowsByCode(db.query.purchaseOrderStatuses.findMany());
  const proformaStatusByCode = await rowsByCode(db.query.proformaStatuses.findMany());
  const contractStatusByCode = await rowsByCode(db.query.contractStatuses.findMany());
  const invoiceStatusByCode = await rowsByCode(db.query.invoiceStatuses.findMany());

  const productByCode = async (modelCode: string) =>
    await db.query.productModels.findFirst({
      where: and(eq(schema.productModels.tenantId, tenantRow.id), eq(schema.productModels.modelCode, modelCode)),
    });
  const inventoryBySerial = async (serialNumber: string) =>
    await db.query.inventoryItems.findFirst({
      where: and(eq(schema.inventoryItems.tenantId, tenantRow.id), eq(schema.inventoryItems.serialNumber, serialNumber)),
    });
  const salesOrderByNo = async (orderNo: string) =>
    await db.query.salesOrders.findFirst({
      where: and(eq(schema.salesOrders.tenantId, tenantRow.id), eq(schema.salesOrders.orderNo, orderNo)),
    });

  const ensureSalesOrder = async (def: {
    orderNo: string;
    companyId?: string;
    quoteNo?: string;
    modelCode: string;
    serialNumber?: string;
    divisionCode: string;
    orderDate: Date;
    statusCode: string;
    unitPrice: number;
    discountAmount: number;
    vatRate: number;
    notes: string;
  }) => {
    if (!def.companyId) return undefined;
    const existing = await salesOrderByNo(def.orderNo);
    if (existing) return existing;
    const quote = def.quoteNo ? await quoteByNo(def.quoteNo) : undefined;
    const model = await productByCode(def.modelCode);
    if (!model) return undefined;
    const inventory = def.serialNumber ? await inventoryBySerial(def.serialNumber) : undefined;
    const subtotal = def.unitPrice - def.discountAmount;
    const vatAmount = subtotal * (def.vatRate / 100);
    const [order] = await db
      .insert(schema.salesOrders)
      .values({
        tenantId: tenantRow.id,
        divisionId: divisionsByCode.get(def.divisionCode)?.id ?? defaultDivision?.id ?? null,
        quoteId: quote?.id ?? null,
        opportunityId: quote?.opportunityId ?? null,
        companyId: def.companyId,
        orderNo: def.orderNo,
        orderDate: def.orderDate,
        statusId: salesOrderStatusByCode.get(def.statusCode) ?? null,
        currencyId: usd?.id,
        subtotal: subtotal.toFixed(4),
        discountTotal: def.discountAmount.toFixed(4),
        vatAmount: vatAmount.toFixed(4),
        grandTotal: (subtotal + vatAmount).toFixed(4),
        notes: def.notes,
        confirmedAt: ['confirmed', 'reserved', 'fulfilled'].includes(def.statusCode) ? def.orderDate : null,
        reservedAt: ['reserved', 'fulfilled'].includes(def.statusCode) ? new Date(def.orderDate.getTime() + 86400000) : null,
        fulfilledAt: def.statusCode === 'fulfilled' ? new Date(def.orderDate.getTime() + 2 * 86400000) : null,
        createdBy: sales?.id ?? null,
        approvedBy: financeUser?.id ?? null,
      })
      .returning();
    const quoteItem = quote
      ? await db.query.quoteItems.findFirst({
          where: and(eq(schema.quoteItems.tenantId, tenantRow.id), eq(schema.quoteItems.quoteId, quote.id)),
        })
      : undefined;
    await db.insert(schema.salesOrderItems).values({
      tenantId: tenantRow.id,
      salesOrderId: order.id,
      quoteItemId: quoteItem?.id ?? null,
      productModelId: model.id,
      inventoryItemId: inventory?.id ?? null,
      description: model.fullName,
      quantity: '1',
      unitId: adetUnit?.id,
      unitPrice: def.unitPrice.toFixed(4),
      discountAmount: def.discountAmount.toFixed(4),
      vatRate: def.vatRate.toFixed(2),
      vatAmount: vatAmount.toFixed(4),
      lineTotal: subtotal.toFixed(4),
      sortOrder: 0,
    });
    return order;
  };

  const salesOrderDefs = [
    { orderNo: 'SO-2026/001', companyId: kilitsan?.id, quoteNo: '2026/16', modelCode: 'DL-2112', serialNumber: 'MFD-DL2112-0002', divisionCode: 'cnc', orderDate: new Date('2026-05-30'), statusCode: 'fulfilled', unitPrice: 170000, discountAmount: 0, vatRate: 0, notes: 'Demo satış siparişi: CNC teslim edilmiş akış.' },
    { orderNo: 'SO-2026/002', companyId: unimak?.id, quoteNo: '2026/UNI-01', modelCode: 'UF-560', serialNumber: 'UNI-UF560-0002', divisionCode: 'universal', orderDate: new Date('2026-06-04'), statusCode: 'reserved', unitPrice: 17200, discountAmount: 0, vatRate: 20, notes: 'Demo satış siparişi: Üniversal stok rezervasyonu.' },
    { orderNo: 'SO-2026/003', companyId: sactech?.id, quoteNo: '2026/SAC-01', modelCode: 'HPB-30135', serialNumber: 'SAC-HPB30135-0002', divisionCode: 'sac_isleme', orderDate: new Date('2026-06-09'), statusCode: 'confirmed', unitPrice: 40500, discountAmount: 0, vatRate: 20, notes: 'Demo satış siparişi: Sac işleme sevkiyata hazırlanıyor.' },
  ];
  for (const order of salesOrderDefs) {
    await ensureSalesOrder(order);
  }
  console.log(`[demo] sales orders ensured: ${salesOrderDefs.length}`);

  const ensurePurchaseOrder = async (def: {
    orderNo: string;
    supplierCompanyId?: string;
    divisionCode: string;
    statusCode: string;
    orderDate: Date;
    expectedDate: Date;
    incoterm: string;
    shipmentReference: string;
    notes: string;
    items: Array<{ modelCode: string; description: string; quantity: string; unitPrice: number; vatRate: number }>;
  }) => {
    const existing = await db.query.purchaseOrders.findFirst({
      where: and(eq(schema.purchaseOrders.tenantId, tenantRow.id), eq(schema.purchaseOrders.orderNo, def.orderNo)),
    });
    if (existing) return existing;
    const subtotal = def.items.reduce((sum, item) => sum + Number(item.quantity) * item.unitPrice, 0);
    const vatAmount = def.items.reduce((sum, item) => sum + Number(item.quantity) * item.unitPrice * (item.vatRate / 100), 0);
    const [po] = await db
      .insert(schema.purchaseOrders)
      .values({
        tenantId: tenantRow.id,
        divisionId: divisionsByCode.get(def.divisionCode)?.id ?? defaultDivision?.id ?? null,
        supplierCompanyId: def.supplierCompanyId ?? null,
        purchaseType: 'commercial',
        orderNo: def.orderNo,
        orderDate: def.orderDate,
        expectedDate: def.expectedDate,
        statusId: purchaseOrderStatusByCode.get(def.statusCode) ?? null,
        currencyId: usd?.id,
        subtotal: subtotal.toFixed(4),
        vatAmount: vatAmount.toFixed(4),
        grandTotal: (subtotal + vatAmount).toFixed(4),
        incoterm: def.incoterm,
        shipmentReference: def.shipmentReference,
        notes: def.notes,
        sentAt: def.orderDate,
        approvedAt: ['approved', 'in_transit', 'received'].includes(def.statusCode) ? new Date(def.orderDate.getTime() + 86400000) : null,
        closedAt: def.statusCode === 'received' ? def.expectedDate : null,
        createdBy: stockUser?.id ?? null,
        approvedBy: financeUser?.id ?? null,
      })
      .returning();
    for (const [index, item] of def.items.entries()) {
      const product = await productByCode(item.modelCode);
      await db.insert(schema.purchaseOrderItems).values({
        tenantId: tenantRow.id,
        purchaseOrderId: po.id,
        productModelId: product?.id ?? null,
        description: item.description,
        quantity: item.quantity,
        unitId: adetUnit?.id,
        unitPrice: item.unitPrice.toFixed(4),
        vatRate: item.vatRate.toFixed(2),
        vatAmount: (Number(item.quantity) * item.unitPrice * (item.vatRate / 100)).toFixed(4),
        lineTotal: (Number(item.quantity) * item.unitPrice).toFixed(4),
        expectedDate: def.expectedDate,
        sortOrder: index,
      });
    }
    return po;
  };

  const purchaseOrderDefs = [
    {
      orderNo: 'PO-2026/001',
      supplierCompanyId: taiwanSupplier?.id,
      divisionCode: 'cnc',
      statusCode: 'in_transit',
      orderDate: new Date('2026-05-18'),
      expectedDate: new Date('2026-07-05'),
      incoterm: 'CIF Istanbul',
      shipmentReference: 'TWN-CNC-2026-07',
      notes: 'Demo ithalat satın alma siparişi.',
      items: [
        { modelCode: 'MV-1050', description: 'LK MV-1050 CNC Dik İşleme Merkezi', quantity: '1', unitPrice: 69000, vatRate: 0 },
        { modelCode: 'DL-2112', description: 'MANFORD DL-2112 Köprü Tipi İşleme Merkezi', quantity: '1', unitPrice: 158000, vatRate: 0 },
      ],
    },
    {
      orderNo: 'PO-2026/002',
      supplierCompanyId: taiwanSupplier?.id,
      divisionCode: 'sac_isleme',
      statusCode: 'approved',
      orderDate: new Date('2026-06-01'),
      expectedDate: new Date('2026-07-20'),
      incoterm: 'FOB Taichung',
      shipmentReference: 'TWN-SAC-2026-02',
      notes: 'Demo sac işleme ekipmanı satın alma siparişi.',
      items: [{ modelCode: 'HPB-30135', description: 'HAKSAN HPB-30135 CNC Abkant Pres', quantity: '1', unitPrice: 36000, vatRate: 0 }],
    },
  ];
  for (const order of purchaseOrderDefs) {
    await ensurePurchaseOrder(order);
  }
  console.log(`[demo] purchase orders ensured: ${purchaseOrderDefs.length}`);

  const ensureProforma = async (def: { quoteNo: string; documentNo: string; statusCode: string; issueDate: Date }) => {
    const existing = await db.query.proformas.findFirst({
      where: and(eq(schema.proformas.tenantId, tenantRow.id), eq(schema.proformas.documentNo, def.documentNo)),
    });
    if (existing) return existing;
    const quote = await quoteByNo(def.quoteNo);
    if (!quote) return undefined;
    const [row] = await db
      .insert(schema.proformas)
      .values({
        tenantId: tenantRow.id,
        divisionId: quote.divisionId ?? defaultDivision?.id ?? null,
        quoteId: quote.id,
        documentNo: def.documentNo,
        issueDate: def.issueDate,
        statusId: proformaStatusByCode.get(def.statusCode) ?? null,
        createdBy: sales?.id ?? null,
      })
      .returning();
    return row;
  };
  const ensureContract = async (def: { quoteNo: string; contractNo: string; statusCode: string; signedDate: Date }) => {
    const existing = await db.query.contracts.findFirst({
      where: and(eq(schema.contracts.tenantId, tenantRow.id), eq(schema.contracts.contractNo, def.contractNo)),
    });
    if (existing) return existing;
    const quote = await quoteByNo(def.quoteNo);
    if (!quote) return undefined;
    const [row] = await db
      .insert(schema.contracts)
      .values({
        tenantId: tenantRow.id,
        divisionId: quote.divisionId ?? defaultDivision?.id ?? null,
        quoteId: quote.id,
        contractNo: def.contractNo,
        signedDate: def.signedDate,
        statusId: contractStatusByCode.get(def.statusCode) ?? null,
        createdBy: sales?.id ?? null,
      })
      .returning();
    return row;
  };
  const ensureCommercialInvoice = async (def: { quoteNo: string; invoiceNo: string; statusCode: string; invoiceDate: Date }) => {
    const existing = await db.query.commercialInvoices.findFirst({
      where: and(eq(schema.commercialInvoices.tenantId, tenantRow.id), eq(schema.commercialInvoices.invoiceNo, def.invoiceNo)),
    });
    if (existing) return existing;
    const quote = await quoteByNo(def.quoteNo);
    if (!quote) return undefined;
    const [row] = await db
      .insert(schema.commercialInvoices)
      .values({
        tenantId: tenantRow.id,
        divisionId: quote.divisionId ?? defaultDivision?.id ?? null,
        quoteId: quote.id,
        invoiceNo: def.invoiceNo,
        invoiceDate: def.invoiceDate,
        statusId: invoiceStatusByCode.get(def.statusCode) ?? null,
        createdBy: financeUser?.id ?? null,
      })
      .returning();
    return row;
  };
  await ensureProforma({ quoteNo: '2026/16', documentNo: 'PF-2026-016', statusCode: 'accepted', issueDate: new Date('2026-05-31') });
  await ensureProforma({ quoteNo: '2026/UNI-01', documentNo: 'PF-2026-UNI-01', statusCode: 'sent', issueDate: new Date('2026-06-05') });
  await ensureContract({ quoteNo: '2026/16', contractNo: 'CNT-2026-016', statusCode: 'signed', signedDate: new Date('2026-06-01') });
  await ensureContract({ quoteNo: '2026/SAC-01', contractNo: 'CNT-2026-SAC-01', statusCode: 'draft', signedDate: new Date('2026-06-10') });
  await ensureCommercialInvoice({ quoteNo: '2026/16', invoiceNo: 'CI-2026-016', statusCode: 'issued', invoiceDate: new Date('2026-06-02') });
  await ensureCommercialInvoice({ quoteNo: '2026/SAC-01', invoiceNo: 'CI-2026-SAC-01', statusCode: 'draft', invoiceDate: new Date('2026-06-10') });
  console.log('[demo] commercial documents ensured');

  // 13. Finance: accounting invoices, receivables, payables and payments
  const paymentStatusByCode = await rowsByCode(db.query.paymentStatuses.findMany());
  const ensureAccountingInvoice = async (def: {
    invoiceNo: string;
    companyId?: string;
    divisionCode: string;
    type: 'sales' | 'purchase';
    invoiceDate: Date;
    amount: number;
    vatAmount: number;
    statusCode: string;
    quoteNo?: string;
    salesOrderNo?: string;
    firstDueDate: Date;
    lastDueDate: Date;
    installmentCount: number;
    notes: string;
    lines: Array<{ modelCode?: string; serialNumber?: string; categoryCode?: string; description: string; quantity: string }>;
  }) => {
    if (!def.companyId) return undefined;
    const existing = await db.query.accountingInvoices.findFirst({
      where: and(eq(schema.accountingInvoices.tenantId, tenantRow.id), eq(schema.accountingInvoices.invoiceNo, def.invoiceNo)),
    });
    if (existing) return existing;
    const quote = def.quoteNo ? await quoteByNo(def.quoteNo) : undefined;
    const salesOrder = def.salesOrderNo ? await salesOrderByNo(def.salesOrderNo) : undefined;
    const [invoice] = await db
      .insert(schema.accountingInvoices)
      .values({
        tenantId: tenantRow.id,
        divisionId: divisionsByCode.get(def.divisionCode)?.id ?? defaultDivision?.id ?? null,
        companyId: def.companyId,
        type: def.type,
        invoiceNo: def.invoiceNo,
        invoiceDate: def.invoiceDate,
        amount: def.amount.toFixed(4),
        vatAmount: def.vatAmount.toFixed(4),
        grandTotal: (def.amount + def.vatAmount).toFixed(4),
        currencyId: usd?.id,
        quoteId: quote?.id ?? null,
        salesOrderId: salesOrder?.id ?? null,
        firstDueDate: def.firstDueDate,
        lastDueDate: def.lastDueDate,
        installmentCount: def.installmentCount,
        statusId: invoiceStatusByCode.get(def.statusCode) ?? null,
        notes: def.notes,
        createdBy: financeUser?.id ?? null,
      })
      .returning();
    for (const line of def.lines) {
      const product = line.modelCode ? await productByCode(line.modelCode) : undefined;
      const inventory = line.serialNumber ? await inventoryBySerial(line.serialNumber) : undefined;
      await db.insert(schema.accountingInvoiceLines).values({
        tenantId: tenantRow.id,
        accountingInvoiceId: invoice.id,
        productModelId: product?.id ?? null,
        inventoryItemId: inventory?.id ?? null,
        categoryCode: line.categoryCode ?? null,
        description: line.description,
        quantity: line.quantity,
      });
    }
    const installmentAmount = (def.amount + def.vatAmount) / def.installmentCount;
    for (let i = 0; i < def.installmentCount; i++) {
      const dueDate =
        def.installmentCount === 1
          ? def.firstDueDate
          : new Date(def.firstDueDate.getTime() + i * 30 * 86400000);
      await db.insert(schema.invoiceInstallments).values({
        tenantId: tenantRow.id,
        accountingInvoiceId: invoice.id,
        installmentNo: i + 1,
        dueDate,
        amount: installmentAmount.toFixed(4),
        statusId: paymentStatusByCode.get(i === 0 ? 'paid' : 'pending') ?? null,
      });
    }
    return invoice;
  };

  const salesInvoice = await ensureAccountingInvoice({
    invoiceNo: 'ACC-S-2026-001',
    companyId: kilitsan?.id,
    divisionCode: 'cnc',
    type: 'sales',
    invoiceDate: new Date('2026-06-02'),
    amount: 170000,
    vatAmount: 0,
    statusCode: 'issued',
    quoteNo: '2026/16',
    salesOrderNo: 'SO-2026/001',
    firstDueDate: new Date('2026-06-15'),
    lastDueDate: new Date('2026-08-15'),
    installmentCount: 3,
    notes: 'Demo satış muhasebe faturası.',
    lines: [{ modelCode: 'DL-2112', serialNumber: 'MFD-DL2112-0002', categoryCode: 'TEZGAH', description: 'MANFORD DL-2112', quantity: '1' }],
  });
  const purchaseInvoice = await ensureAccountingInvoice({
    invoiceNo: 'ACC-P-2026-001',
    companyId: taiwanSupplier?.id,
    divisionCode: 'cnc',
    type: 'purchase',
    invoiceDate: new Date('2026-06-04'),
    amount: 65000,
    vatAmount: 0,
    statusCode: 'issued',
    firstDueDate: new Date('2026-07-05'),
    lastDueDate: new Date('2026-07-05'),
    installmentCount: 1,
    notes: 'Demo tedarikçi faturası.',
    lines: [{ modelCode: 'MV-1050', categoryCode: 'TEZGAH', description: 'LK MV-1050 ithalat avansı', quantity: '1' }],
  });

  const ensureReceivable = async (def: {
    companyId?: string;
    divisionCode: string;
    quoteNo?: string;
    accountingInvoiceId?: string;
    invoiceNo: string;
    amount: number;
    dueDate: Date;
    statusCode: string;
    notes: string;
  }) => {
    if (!def.companyId) return undefined;
    const existing = await db.query.receivables.findFirst({
      where: and(eq(schema.receivables.tenantId, tenantRow.id), eq(schema.receivables.invoiceNo, def.invoiceNo), eq(schema.receivables.amount, def.amount.toFixed(4))),
    });
    if (existing) return existing;
    const quote = def.quoteNo ? await quoteByNo(def.quoteNo) : undefined;
    const [row] = await db
      .insert(schema.receivables)
      .values({
        tenantId: tenantRow.id,
        divisionId: divisionsByCode.get(def.divisionCode)?.id ?? defaultDivision?.id ?? null,
        companyId: def.companyId,
        quoteId: quote?.id ?? null,
        accountingInvoiceId: def.accountingInvoiceId ?? null,
        invoiceNo: def.invoiceNo,
        movementType: 'sales_invoice',
        documentRef: def.invoiceNo,
        amount: def.amount.toFixed(4),
        currencyId: usd?.id,
        dueDate: def.dueDate,
        statusId: paymentStatusByCode.get(def.statusCode) ?? null,
        notes: def.notes,
      })
      .returning();
    return row;
  };
  const ensurePayable = async (def: {
    companyId?: string;
    divisionCode: string;
    accountingInvoiceId?: string;
    invoiceNo: string;
    amount: number;
    dueDate: Date;
    statusCode: string;
    notes: string;
  }) => {
    if (!def.companyId) return undefined;
    const existing = await db.query.payables.findFirst({
      where: and(eq(schema.payables.tenantId, tenantRow.id), eq(schema.payables.invoiceNo, def.invoiceNo), eq(schema.payables.amount, def.amount.toFixed(4))),
    });
    if (existing) return existing;
    const [row] = await db
      .insert(schema.payables)
      .values({
        tenantId: tenantRow.id,
        divisionId: divisionsByCode.get(def.divisionCode)?.id ?? defaultDivision?.id ?? null,
        companyId: def.companyId,
        accountingInvoiceId: def.accountingInvoiceId ?? null,
        invoiceNo: def.invoiceNo,
        movementType: 'purchase_invoice',
        documentRef: def.invoiceNo,
        amount: def.amount.toFixed(4),
        currencyId: usd?.id,
        dueDate: def.dueDate,
        statusId: paymentStatusByCode.get(def.statusCode) ?? null,
        notes: def.notes,
      })
      .returning();
    return row;
  };
  const receivablePaid = await ensureReceivable({ companyId: kilitsan?.id, divisionCode: 'cnc', quoteNo: '2026/16', accountingInvoiceId: salesInvoice?.id, invoiceNo: 'ACC-S-2026-001/1', amount: 50000, dueDate: new Date('2026-06-15'), statusCode: 'paid', notes: 'Demo tahsil edilmiş taksit.' });
  await ensureReceivable({ companyId: kilitsan?.id, divisionCode: 'cnc', quoteNo: '2026/16', accountingInvoiceId: salesInvoice?.id, invoiceNo: 'ACC-S-2026-001/2', amount: 60000, dueDate: new Date('2026-07-15'), statusCode: 'pending', notes: 'Demo bekleyen tahsilat.' });
  await ensureReceivable({ companyId: kilitsan?.id, divisionCode: 'cnc', quoteNo: '2026/16', accountingInvoiceId: salesInvoice?.id, invoiceNo: 'ACC-S-2026-001/3', amount: 60000, dueDate: new Date('2026-08-15'), statusCode: 'pending', notes: 'Demo ileri vadeli tahsilat.' });
  const payablePaid = await ensurePayable({ companyId: taiwanSupplier?.id, divisionCode: 'cnc', accountingInvoiceId: purchaseInvoice?.id, invoiceNo: 'ACC-P-2026-001/1', amount: 25000, dueDate: new Date('2026-06-20'), statusCode: 'paid', notes: 'Demo tedarikçi avans ödemesi.' });
  await ensurePayable({ companyId: taiwanSupplier?.id, divisionCode: 'cnc', accountingInvoiceId: purchaseInvoice?.id, invoiceNo: 'ACC-P-2026-001/2', amount: 40000, dueDate: new Date('2026-07-05'), statusCode: 'pending', notes: 'Demo bekleyen tedarikçi ödemesi.' });

  const ensurePayment = async (def: {
    companyId?: string;
    divisionCode: string;
    receivableId?: string;
    payableId?: string;
    accountingInvoiceId?: string;
    invoiceNo: string;
    direction: 'in' | 'out';
    amount: number;
    paymentDate: Date;
    paymentMethod: string;
    notes: string;
  }) => {
    if (!def.companyId) return undefined;
    const existing = await db.query.payments.findFirst({
      where: and(eq(schema.payments.tenantId, tenantRow.id), eq(schema.payments.invoiceNo, def.invoiceNo), eq(schema.payments.direction, def.direction)),
    });
    if (existing) return existing;
    const [row] = await db
      .insert(schema.payments)
      .values({
        tenantId: tenantRow.id,
        divisionId: divisionsByCode.get(def.divisionCode)?.id ?? defaultDivision?.id ?? null,
        receivableId: def.receivableId ?? null,
        payableId: def.payableId ?? null,
        accountingInvoiceId: def.accountingInvoiceId ?? null,
        companyId: def.companyId,
        invoiceNo: def.invoiceNo,
        direction: def.direction,
        amount: def.amount.toFixed(4),
        currencyId: usd?.id,
        paymentDate: def.paymentDate,
        paymentMethod: def.paymentMethod,
        statusId: paymentStatusByCode.get('paid') ?? null,
        notes: def.notes,
        createdBy: financeUser?.id ?? null,
      })
      .returning();
    return row;
  };
  await ensurePayment({ companyId: kilitsan?.id, divisionCode: 'cnc', receivableId: receivablePaid?.id, accountingInvoiceId: salesInvoice?.id, invoiceNo: 'ACC-S-2026-001/1', direction: 'in', amount: 50000, paymentDate: new Date('2026-06-16'), paymentMethod: 'bank_transfer', notes: 'Demo banka tahsilatı.' });
  await ensurePayment({ companyId: taiwanSupplier?.id, divisionCode: 'cnc', payableId: payablePaid?.id, accountingInvoiceId: purchaseInvoice?.id, invoiceNo: 'ACC-P-2026-001/1', direction: 'out', amount: 25000, paymentDate: new Date('2026-06-21'), paymentMethod: 'bank_transfer', notes: 'Demo tedarikçi avans ödemesi.' });
  console.log('[demo] finance records ensured');

  // 14. Shipments and deliveries
  const shipmentStatusByCode = await rowsByCode(db.query.shipmentStatuses.findMany());
  const shipmentByNo = async (shipmentNo: string) =>
    await db.query.shipments.findFirst({
      where: and(eq(schema.shipments.tenantId, tenantRow.id), eq(schema.shipments.shipmentNo, shipmentNo)),
    });
  const ensureShipment = async (def: {
    shipmentNo: string;
    companyId?: string;
    quoteNo?: string;
    salesOrderNo?: string;
    divisionCode: string;
    statusCode: string;
    carrier: string;
    trackingNo: string;
    origin: string;
    destination: string;
    eta: Date;
    incoterm: string;
    shippedAt?: Date;
    arrivedAt?: Date;
    customsClearedAt?: Date;
    notes: string;
    items: Array<{ serialNumber?: string; modelCode: string; description: string; quantity: string }>;
  }) => {
    if (!def.companyId) return undefined;
    const existing = await shipmentByNo(def.shipmentNo);
    if (existing) return existing;
    const quote = def.quoteNo ? await quoteByNo(def.quoteNo) : undefined;
    const salesOrder = def.salesOrderNo ? await salesOrderByNo(def.salesOrderNo) : undefined;
    const [shipment] = await db
      .insert(schema.shipments)
      .values({
        tenantId: tenantRow.id,
        divisionId: divisionsByCode.get(def.divisionCode)?.id ?? defaultDivision?.id ?? null,
        opportunityId: quote?.opportunityId ?? null,
        quoteId: quote?.id ?? null,
        salesOrderId: salesOrder?.id ?? null,
        companyId: def.companyId,
        shipmentNo: def.shipmentNo,
        carrier: def.carrier,
        trackingNo: def.trackingNo,
        statusId: shipmentStatusByCode.get(def.statusCode) ?? null,
        origin: def.origin,
        destination: def.destination,
        eta: def.eta,
        incoterm: def.incoterm,
        shippedAt: def.shippedAt ?? null,
        arrivedAt: def.arrivedAt ?? null,
        customsClearedAt: def.customsClearedAt ?? null,
        notes: def.notes,
      })
      .returning();
    for (const [index, item] of def.items.entries()) {
      const product = await productByCode(item.modelCode);
      const inventory = item.serialNumber ? await inventoryBySerial(item.serialNumber) : undefined;
      const salesOrderItem = salesOrder
        ? await db.query.salesOrderItems.findFirst({
            where: and(eq(schema.salesOrderItems.tenantId, tenantRow.id), eq(schema.salesOrderItems.salesOrderId, salesOrder.id)),
          })
        : undefined;
      await db.insert(schema.shipmentItems).values({
        tenantId: tenantRow.id,
        shipmentId: shipment.id,
        inventoryItemId: inventory?.id ?? null,
        salesOrderItemId: salesOrderItem?.id ?? null,
        productModelId: product?.id ?? null,
        description: item.description,
        serialNumber: item.serialNumber ?? null,
        quantity: item.quantity,
        unitId: adetUnit?.id,
        sortOrder: index,
      });
    }
    return shipment;
  };

  const deliveredShipment = await ensureShipment({
    shipmentNo: 'SHP-2026-001',
    companyId: kilitsan?.id,
    quoteNo: '2026/16',
    salesOrderNo: 'SO-2026/001',
    divisionCode: 'cnc',
    statusCode: 'delivered',
    carrier: 'Mars Logistics',
    trackingNo: 'MRS-TR-2026-001',
    origin: 'Taichung, Taiwan',
    destination: 'Hendek, Sakarya',
    eta: new Date('2026-06-12'),
    incoterm: 'CIF Istanbul',
    shippedAt: new Date('2026-06-03'),
    arrivedAt: new Date('2026-06-11'),
    customsClearedAt: new Date('2026-06-12'),
    notes: 'Demo teslim edilmiş sevkiyat.',
    items: [{ serialNumber: 'MFD-DL2112-0002', modelCode: 'DL-2112', description: 'MANFORD DL-2112', quantity: '1' }],
  });
  const inTransitShipment = await ensureShipment({
    shipmentNo: 'SHP-2026-002',
    companyId: sactech?.id,
    quoteNo: '2026/SAC-01',
    salesOrderNo: 'SO-2026/003',
    divisionCode: 'sac_isleme',
    statusCode: 'in_transit',
    carrier: 'Ekol Logistics',
    trackingNo: 'EKL-SAC-2026-002',
    origin: 'Taichung, Taiwan',
    destination: 'Nilüfer OSB, Bursa',
    eta: new Date('2026-07-02'),
    incoterm: 'FOB Taichung',
    shippedAt: new Date('2026-06-15'),
    notes: 'Demo yolda sevkiyat.',
    items: [{ serialNumber: 'SAC-HPB30135-0002', modelCode: 'HPB-30135', description: 'HAKSAN HPB-30135', quantity: '1' }],
  });

  const ensureDelivery = async (def: {
    companyId?: string;
    shipmentId?: string;
    salesOrderNo?: string;
    quoteNo?: string;
    divisionCode: string;
    deliveryDate: Date;
    signedBy: string;
    status: 'pending' | 'completed';
    notes: string;
    formData: Record<string, unknown>;
  }) => {
    if (!def.companyId) return undefined;
    const existing = await db.query.deliveries.findFirst({
      where: and(eq(schema.deliveries.tenantId, tenantRow.id), eq(schema.deliveries.notes, def.notes)),
    });
    if (existing) return existing;
    const quote = def.quoteNo ? await quoteByNo(def.quoteNo) : undefined;
    const salesOrder = def.salesOrderNo ? await salesOrderByNo(def.salesOrderNo) : undefined;
    const [delivery] = await db
      .insert(schema.deliveries)
      .values({
        tenantId: tenantRow.id,
        divisionId: divisionsByCode.get(def.divisionCode)?.id ?? defaultDivision?.id ?? null,
        opportunityId: quote?.opportunityId ?? null,
        companyId: def.companyId,
        shipmentId: def.shipmentId ?? null,
        salesOrderId: salesOrder?.id ?? null,
        deliveryDate: def.deliveryDate,
        signedBy: def.signedBy,
        status: def.status,
        notes: def.notes,
        formData: def.formData,
      })
      .returning();
    return delivery;
  };
  await ensureDelivery({
    companyId: kilitsan?.id,
    shipmentId: deliveredShipment?.id,
    salesOrderNo: 'SO-2026/001',
    quoteNo: '2026/16',
    divisionCode: 'cnc',
    deliveryDate: new Date('2026-06-13'),
    signedBy: 'Metin YILMAZ',
    status: 'completed',
    notes: 'Demo CNC teslim ve kurulum tutanağı.',
    formData: {
      formNo: 'KRL-2026-001',
      kurulumTarihi: new Date('2026-06-13'),
      tezgah: { marka: 'MANFORD', tip: 'Köprü Tipi CNC Dik İşleme Merkezi', model: 'DL-2112', seriNo: 'MFD-DL2112-0002' },
      cnc: { marka: 'Fanuc', model: '0i-MF Plus', seriNo: 'FNC-0002', mainSw: 'v12.4' },
      ilgili: 'Metin YILMAZ',
      kurulumuYapan: 'Servis Sorumlusu',
    },
  });
  await ensureDelivery({
    companyId: sactech?.id,
    shipmentId: inTransitShipment?.id,
    salesOrderNo: 'SO-2026/003',
    quoteNo: '2026/SAC-01',
    divisionCode: 'sac_isleme',
    deliveryDate: new Date('2026-07-03'),
    signedBy: 'Murat Kaya',
    status: 'pending',
    notes: 'Demo sac işleme teslim hazırlığı.',
    formData: {
      formNo: 'KRL-2026-002',
      kurulumTarihi: new Date('2026-07-03'),
      tezgah: { marka: 'HAKSAN', tip: 'CNC Abkant Pres', model: 'HPB-30135', seriNo: 'SAC-HPB30135-0002' },
      cnc: { marka: 'Delem', model: 'DA-66T', seriNo: 'DLM-30135-02', mainSw: 'v8.1' },
      ilgili: 'Murat Kaya',
      kurulumuYapan: 'Servis Sorumlusu',
    },
  });
  console.log('[demo] shipments and deliveries ensured');

  // 15. Service tickets and chat
  const serviceStatusByCode = await rowsByCode(db.query.serviceTicketStatuses.findMany());
  const deviceBySerial = async (serialNumber: string) => {
    const item = await inventoryBySerial(serialNumber);
    if (!item) return undefined;
    return await db.query.customerDevices.findFirst({
      where: and(eq(schema.customerDevices.tenantId, tenantRow.id), eq(schema.customerDevices.inventoryItemId, item.id)),
    });
  };
  const ensureServiceTicket = async (def: {
    ticketNo: string;
    companyId?: string;
    serialNumber?: string;
    divisionCode: string;
    statusCode: string;
    subject: string;
    description: string;
    severity: 'low' | 'normal' | 'high' | 'critical';
    reportedAt: Date;
    resolvedAt?: Date;
    resolutionNote?: string;
    metadata: Record<string, unknown>;
  }) => {
    if (!def.companyId) return undefined;
    const existing = await db.query.serviceTickets.findFirst({
      where: and(eq(schema.serviceTickets.tenantId, tenantRow.id), eq(schema.serviceTickets.ticketNo, def.ticketNo)),
    });
    if (existing) return existing;
    const device = def.serialNumber ? await deviceBySerial(def.serialNumber) : undefined;
    const [ticket] = await db
      .insert(schema.serviceTickets)
      .values({
        tenantId: tenantRow.id,
        divisionId: divisionsByCode.get(def.divisionCode)?.id ?? defaultDivision?.id ?? null,
        ticketNo: def.ticketNo,
        companyId: def.companyId,
        customerDeviceId: device?.id ?? null,
        subject: def.subject,
        description: def.description,
        severity: def.severity,
        statusId: serviceStatusByCode.get(def.statusCode) ?? null,
        assignedToUserId: serviceUser?.id ?? null,
        reportedAt: def.reportedAt,
        resolvedAt: def.resolvedAt ?? null,
        resolutionNote: def.resolutionNote ?? null,
        metadata: def.metadata,
      })
      .returning();
    return ticket;
  };
  const serviceTicket1 = await ensureServiceTicket({
    ticketNo: 'SRV-2026-001',
    companyId: kilitsan?.id,
    serialNumber: 'MFD-DL2112-0002',
    divisionCode: 'cnc',
    statusCode: 'open',
    subject: 'Fener mili ısınma kontrolü',
    description: 'Operatör, uzun çevrimde fener mili sıcaklığının beklenenden hızlı yükseldiğini bildirdi.',
    severity: 'high',
    reportedAt: new Date('2026-06-16T09:30:00Z'),
    metadata: {
      timerStatus: 'running',
      timerElapsedSeconds: 5400,
      serviceHourlyRate: 120,
      serviceCurrency: 'USD',
      operations: [{ id: 'op-demo-1', description: 'Uzaktan teşhis ve parametre kontrolü', quantity: 1, unitPrice: 120, currency: 'USD' }],
    },
  });
  await ensureServiceTicket({
    ticketNo: 'SRV-2026-002',
    companyId: alipler?.id,
    serialNumber: 'ECO-MT208-0003',
    divisionCode: 'cnc',
    statusCode: 'resolved',
    subject: 'Taret referans hatası',
    description: 'Taret sıfırlama sonrasında referans uyarısı alınıyor.',
    severity: 'normal',
    reportedAt: new Date('2026-05-28T08:15:00Z'),
    resolvedAt: new Date('2026-05-29T14:30:00Z'),
    resolutionNote: 'Limit switch temizlendi, referans döngüsü test edildi.',
    metadata: { timerStatus: 'stopped', timerElapsedSeconds: 12600, serviceHourlyRate: 120, serviceCurrency: 'USD' },
  });
  await ensureServiceTicket({
    ticketNo: 'SRV-2026-003',
    companyId: unimak?.id,
    serialNumber: 'UNI-UF560-0001',
    divisionCode: 'universal',
    statusCode: 'in_progress',
    subject: 'Tabla boşluk ayarı',
    description: 'X ekseninde hassas paso sırasında boşluk şüphesi var.',
    severity: 'normal',
    reportedAt: new Date('2026-06-12T10:00:00Z'),
    metadata: { timerStatus: 'paused', timerElapsedSeconds: 3600, serviceHourlyRate: 90, serviceCurrency: 'USD' },
  });
  await ensureServiceTicket({
    ticketNo: 'SRV-2026-004',
    companyId: sactech?.id,
    serialNumber: 'SAC-HPB30135-0001',
    divisionCode: 'sac_isleme',
    statusCode: 'closed',
    subject: 'Arka dayama kalibrasyonu',
    description: 'Büküm ölçülerinde 0,4 mm sapma ölçüldü.',
    severity: 'low',
    reportedAt: new Date('2026-04-20T11:20:00Z'),
    resolvedAt: new Date('2026-04-20T16:45:00Z'),
    resolutionNote: 'Arka dayama referansı ve takım tablosu kalibre edildi.',
    metadata: { timerStatus: 'stopped', timerElapsedSeconds: 7200, serviceHourlyRate: 120, serviceCurrency: 'USD' },
  });
  console.log('[demo] service tickets ensured');

  const chatUsers = [sales, serviceUser, financeUser, stockUser].filter((u): u is NonNullable<typeof u> => !!u);
  if (chatUsers.length) {
    const existingConversation = await db.query.conversations.findFirst({
      where: and(eq(schema.conversations.tenantId, tenantRow.id), eq(schema.conversations.title, 'Demo Operasyon Takibi')),
    });
    const conversation =
      existingConversation ??
      (
        await db
          .insert(schema.conversations)
          .values({
            tenantId: tenantRow.id,
            type: 'group',
            title: 'Demo Operasyon Takibi',
            description: 'Seed demo sohbet grubu.',
            onlyAdminsCanPost: false,
            refType: 'service_ticket',
            refId: serviceTicket1?.id ?? null,
            createdBy: sales?.id ?? null,
          })
          .returning()
      )[0];
    for (const [index, user] of chatUsers.entries()) {
      await db
        .insert(schema.conversationMembers)
        .values({
          conversationId: conversation.id,
          userId: user.id,
          role: index === 0 ? 'admin' : 'member',
          lastReadAt: index === 0 ? new Date('2026-06-18T08:00:00Z') : null,
        })
        .onConflictDoNothing();
    }
    const existingMessage = await db.query.chatMessages.findFirst({
      where: and(eq(schema.chatMessages.tenantId, tenantRow.id), eq(schema.chatMessages.conversationId, conversation.id)),
    });
    if (!existingMessage) {
      await db.insert(schema.chatMessages).values([
        {
          tenantId: tenantRow.id,
          conversationId: conversation.id,
          senderId: sales?.id ?? chatUsers[0].id,
          body: 'Kilitsan teslimatı tamamlandı, servis fener mili ısınma talebini takip ediyor.',
          kind: 'text',
          refType: 'company',
          refId: kilitsan?.id ?? null,
          createdAt: new Date('2026-06-18T07:45:00Z'),
        },
        {
          tenantId: tenantRow.id,
          conversationId: conversation.id,
          senderId: serviceUser?.id ?? chatUsers[0].id,
          body: 'Servis kaydını açtım, uzaktan teşhis sonrası saha ziyareti planlayacağım.',
          kind: 'text',
          refType: 'service_ticket',
          refId: serviceTicket1?.id ?? null,
          createdAt: new Date('2026-06-18T07:50:00Z'),
        },
        {
          tenantId: tenantRow.id,
          conversationId: conversation.id,
          senderId: financeUser?.id ?? chatUsers[0].id,
          body: 'İlk tahsilat işlendi, kalan iki vade takvimde görünüyor.',
          kind: 'text',
          refType: 'quote',
          refId: (await quoteByNo('2026/16'))?.id ?? null,
          createdAt: new Date('2026-06-18T07:58:00Z'),
        },
      ]);
    }
    console.log('[demo] chat conversation ensured');
  }

  // 16. Legacy demo rows created before division isolation: make them visible to scoped users.
  if (defaultDivision?.id) {
    await db.update(schema.opportunities).set({ divisionId: defaultDivision.id }).where(and(eq(schema.opportunities.tenantId, tenantRow.id), isNull(schema.opportunities.divisionId)));
    await db.update(schema.salesActivities).set({ divisionId: defaultDivision.id }).where(and(eq(schema.salesActivities.tenantId, tenantRow.id), isNull(schema.salesActivities.divisionId)));
    await db.update(schema.visits).set({ divisionId: defaultDivision.id }).where(and(eq(schema.visits.tenantId, tenantRow.id), isNull(schema.visits.divisionId)));
    await db.update(schema.calls).set({ divisionId: defaultDivision.id }).where(and(eq(schema.calls.tenantId, tenantRow.id), isNull(schema.calls.divisionId)));
    await db.update(schema.quotes).set({ divisionId: defaultDivision.id }).where(and(eq(schema.quotes.tenantId, tenantRow.id), isNull(schema.quotes.divisionId)));
    await db.update(schema.quoteItems).set({ divisionId: defaultDivision.id }).where(and(eq(schema.quoteItems.tenantId, tenantRow.id), isNull(schema.quoteItems.divisionId)));
    await db.update(schema.proformas).set({ divisionId: defaultDivision.id }).where(and(eq(schema.proformas.tenantId, tenantRow.id), isNull(schema.proformas.divisionId)));
    await db.update(schema.contracts).set({ divisionId: defaultDivision.id }).where(and(eq(schema.contracts.tenantId, tenantRow.id), isNull(schema.contracts.divisionId)));
    await db.update(schema.commercialInvoices).set({ divisionId: defaultDivision.id }).where(and(eq(schema.commercialInvoices.tenantId, tenantRow.id), isNull(schema.commercialInvoices.divisionId)));
    await db.update(schema.salesOrders).set({ divisionId: defaultDivision.id }).where(and(eq(schema.salesOrders.tenantId, tenantRow.id), isNull(schema.salesOrders.divisionId)));
    await db.update(schema.purchaseOrders).set({ divisionId: defaultDivision.id }).where(and(eq(schema.purchaseOrders.tenantId, tenantRow.id), isNull(schema.purchaseOrders.divisionId)));
    await db.update(schema.inventoryItems).set({ divisionId: defaultDivision.id }).where(and(eq(schema.inventoryItems.tenantId, tenantRow.id), isNull(schema.inventoryItems.divisionId)));
    await db.update(schema.inventoryMovements).set({ divisionId: defaultDivision.id }).where(and(eq(schema.inventoryMovements.tenantId, tenantRow.id), isNull(schema.inventoryMovements.divisionId)));
    await db.update(schema.customerDevices).set({ divisionId: defaultDivision.id }).where(and(eq(schema.customerDevices.tenantId, tenantRow.id), isNull(schema.customerDevices.divisionId)));
    await db.update(schema.installationJobs).set({ divisionId: defaultDivision.id }).where(and(eq(schema.installationJobs.tenantId, tenantRow.id), isNull(schema.installationJobs.divisionId)));
    await db.update(schema.serviceTickets).set({ divisionId: defaultDivision.id }).where(and(eq(schema.serviceTickets.tenantId, tenantRow.id), isNull(schema.serviceTickets.divisionId)));
    await db.update(schema.shipments).set({ divisionId: defaultDivision.id }).where(and(eq(schema.shipments.tenantId, tenantRow.id), isNull(schema.shipments.divisionId)));
    await db.update(schema.deliveries).set({ divisionId: defaultDivision.id }).where(and(eq(schema.deliveries.tenantId, tenantRow.id), isNull(schema.deliveries.divisionId)));
    await db.update(schema.accountingInvoices).set({ divisionId: defaultDivision.id }).where(and(eq(schema.accountingInvoices.tenantId, tenantRow.id), isNull(schema.accountingInvoices.divisionId)));
    await db.update(schema.receivables).set({ divisionId: defaultDivision.id }).where(and(eq(schema.receivables.tenantId, tenantRow.id), isNull(schema.receivables.divisionId)));
    await db.update(schema.payables).set({ divisionId: defaultDivision.id }).where(and(eq(schema.payables.tenantId, tenantRow.id), isNull(schema.payables.divisionId)));
    await db.update(schema.payments).set({ divisionId: defaultDivision.id }).where(and(eq(schema.payments.tenantId, tenantRow.id), isNull(schema.payments.divisionId)));
  }

  console.log('[demo] all seeds applied.');
}

if (require.main === module) {
  seedLookups()
    .then(() => seedDemo())
    .then(() => closeDb())
    .then(() => console.log('[demo] done (dev/CI only — not for production)'))
    .catch((err) => {
      console.error('[demo] failed:', err);
      process.exit(1);
    });
}
