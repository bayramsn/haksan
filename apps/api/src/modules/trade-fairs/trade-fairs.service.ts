import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, exists, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import type {
  TradeFairContactInput,
  TradeFairContactUpdateInput,
  TradeFairListQuery,
  TradeFairProductQuery,
  TradeFairToCompanyInput,
} from '@haksan/shared';
import { companyCreateSchema, contactCreateSchema, emailSchema, phoneSchema } from '@haksan/shared';
import type { DbClient } from '../../db/client';
import { companies, contactSources, divisions, fileLinks, productCategories, productGroups, productModels, tradeFairContactProducts, tradeFairContacts, users } from '../../db/schema';
import { DB } from '../../shared/database/database.module';
import { AuditService } from '../../shared/database/audit.service';
import type { AuthContext } from '../../shared/security/auth.types';
import { buildPaginated, pageOffset } from '../../shared/utils/pagination';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/utils/errors';
import { lookupIdByCode } from '../../shared/utils/lookup.helper';
import { CompaniesService } from '../companies/companies.service';
import { ContactsService } from '../contacts/contacts.service';

type DbTransaction = Parameters<Parameters<DbClient['transaction']>[0]>[0];

const emptyToNull = (value: string | null | undefined) => (value?.trim() ? value.trim() : null);

/**
 * Fuar görüşmeleri. Kiracı içinde herkes her kaydı görür ve düzenler;
 * silme yalnız kaydı açana veya yöneticiye açık.
 */
@Injectable()
export class TradeFairsService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly audit: AuditService,
    private readonly companiesService: CompaniesService,
    private readonly contactsService: ContactsService
  ) {}

  /** Kayıtlar dış kişilerin iletişim bilgisini taşıyor ve herkes düzenleyebiliyor; iz kalsın. */
  private log(actor: AuthContext, action: string, id: string, oldValues?: object, newValues?: object) {
    return this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: `trade_fair_contact.${action}`,
      resourceType: 'trade_fair_contact',
      resourceId: id,
      oldValues: oldValues as Record<string, unknown> | undefined,
      newValues: newValues as Record<string, unknown> | undefined,
    });
  }

  private isManager(actor: AuthContext) {
    return actor.roles.includes('admin') || actor.roles.includes('super_admin');
  }

  private baseFilters(actor: AuthContext): SQL[] {
    return [eq(tradeFairContacts.tenantId, actor.tenantId), isNull(tradeFairContacts.deletedAt)];
  }

  private async assertTenantUser(actor: AuthContext, userId: string | null | undefined) {
    if (!userId) return;
    const [row] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.tenantId, actor.tenantId), isNull(users.deletedAt)))
      .limit(1);
    if (!row) throw new ValidationError('Görüşen kişi bulunamadı');
  }

  private async assertTenantDivision(actor: AuthContext, divisionId: string | null | undefined) {
    if (!divisionId) return;
    const [row] = await this.db
      .select({ id: divisions.id })
      .from(divisions)
      .where(and(eq(divisions.id, divisionId), eq(divisions.tenantId, actor.tenantId), eq(divisions.isActive, true)))
      .limit(1);
    if (!row) throw new ValidationError('Bölüm bulunamadı');
  }

  /** Bölüm seçimi için kiracının aktif bölümleri; fuar alanı herkese açık olduğundan ayrı uç. */
  divisions(actor: AuthContext) {
    return this.db
      .select({ id: divisions.id, code: divisions.code, name: divisions.name })
      .from(divisions)
      .where(and(eq(divisions.tenantId, actor.tenantId), eq(divisions.isActive, true)))
      .orderBy(asc(divisions.name));
  }

  /**
   * Ürün seçici: seçilen bölümün ve bölümsüz (ortak) gruplardaki aktif, katalogda
   * gizlenmemiş ürünler. Fuar herkese açık olduğu için kullanıcının bölüm kapsamı
   * uygulanmaz; yalnız ad ve kategori döner.
   */
  products(actor: AuthContext, query: TradeFairProductQuery) {
    const filters: SQL[] = [
      eq(productModels.tenantId, actor.tenantId),
      isNull(productModels.deletedAt),
      eq(productModels.isActive, true),
      eq(productModels.catalogHidden, false),
      or(eq(productGroups.divisionId, query.divisionId), isNull(productGroups.divisionId))!,
    ];
    if (query.q) filters.push(ilike(productModels.fullName, `%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`));
    return this.db
      .select({ id: productModels.id, name: productModels.fullName, category: productCategories.name })
      .from(productModels)
      .leftJoin(productGroups, eq(productModels.productGroupId, productGroups.id))
      .leftJoin(productCategories, eq(productModels.categoryId, productCategories.id))
      .where(and(...filters))
      .orderBy(asc(productModels.fullName))
      // ponytail: seçici bölümün kataloğunu tek seferde yükleyip istemcide süzer; bölüm başına
      // ürün sayısı binleri aşarsa istemci aramayı q ile sunucuya taşımalı.
      .limit(query.q ? 50 : 500);
  }

  /** Yeni eklenen ürünler kiracıda ve silinmemiş olmalı. */
  private async assertTenantProducts(actor: AuthContext, productModelIds: string[]) {
    if (!productModelIds.length) return;
    const rows = await this.db
      .select({ id: productModels.id })
      .from(productModels)
      .where(and(inArray(productModels.id, productModelIds), eq(productModels.tenantId, actor.tenantId), isNull(productModels.deletedAt)));
    if (rows.length !== productModelIds.length) throw new ValidationError('Seçilen ürünlerden biri bulunamadı');
  }

  private async productIdsOf(contactId: string): Promise<string[]> {
    const rows = await this.db
      .select({ id: tradeFairContactProducts.productModelId })
      .from(tradeFairContactProducts)
      .where(eq(tradeFairContactProducts.tradeFairContactId, contactId));
    return rows.map((r) => r.id);
  }

  /**
   * Ürün listesini verilen kümeyle değiştirir. Zaten bağlı olan ürün yeniden
   * doğrulanmaz: sonradan pasife alınan ürün, kaydın düzenlenmesini engellemesin.
   */
  /** Yeni eklenen ürünleri doğrular; zaten bağlı olanlar (sonradan pasife alınmış olsa da) serbest. */
  private async validateProducts(actor: AuthContext, contactId: string | null, wanted: string[]) {
    const unique = [...new Set(wanted)];
    const current = contactId ? await this.productIdsOf(contactId) : [];
    await this.assertTenantProducts(actor, unique.filter((id) => !current.includes(id)));
    return unique;
  }

  /** Ürün kümesini değiştirir; çağıran satır yazımıyla aynı işlemde (tx) çalıştırır. */
  private async writeProducts(tx: DbTransaction, actor: AuthContext, contactId: string, productIds: string[]) {
    await tx.delete(tradeFairContactProducts).where(eq(tradeFairContactProducts.tradeFairContactId, contactId));
    if (productIds.length) {
      // Eşzamanlı iki PATCH aynı ürünü eklerse PK çakışması 500 yerine yok sayılsın.
      await tx
        .insert(tradeFairContactProducts)
        .values(productIds.map((productModelId) => ({ tenantId: actor.tenantId, tradeFairContactId: contactId, productModelId })))
        .onConflictDoNothing();
    }
  }

  /** Liste/yanıt için kayıtların ürün adları; bölüm kapsamı yok, ürün yalnız etiket. */
  private async productsFor(contactIds: string[]) {
    const map = new Map<string, Array<{ id: string; name: string }>>();
    if (!contactIds.length) return map;
    const rows = await this.db
      .select({ contactId: tradeFairContactProducts.tradeFairContactId, id: productModels.id, name: productModels.fullName })
      .from(tradeFairContactProducts)
      .innerJoin(productModels, eq(tradeFairContactProducts.productModelId, productModels.id))
      .where(inArray(tradeFairContactProducts.tradeFairContactId, contactIds))
      .orderBy(asc(productModels.fullName));
    for (const r of rows) map.set(r.contactId, [...(map.get(r.contactId) ?? []), { id: r.id, name: r.name }]);
    return map;
  }

  private normalize<T extends TradeFairContactUpdateInput>({ productModelIds: _products, ...input }: T) {
    return {
      ...input,
      ...('contactTitle' in input ? { contactTitle: emptyToNull(input.contactTitle) } : {}),
      ...('mobilePhone' in input ? { mobilePhone: emptyToNull(input.mobilePhone) } : {}),
      ...('email' in input ? { email: emptyToNull(input.email) } : {}),
      ...('province' in input ? { province: emptyToNull(input.province) } : {}),
      ...('district' in input ? { district: emptyToNull(input.district) } : {}),
      ...('productCategory' in input ? { productCategory: emptyToNull(input.productCategory) } : {}),
      ...('productType' in input ? { productType: emptyToNull(input.productType) } : {}),
      ...('notes' in input ? { notes: emptyToNull(input.notes) } : {}),
    };
  }

  async list(actor: AuthContext, query: TradeFairListQuery) {
    const { limit, offset } = pageOffset(query);
    const filters = this.baseFilters(actor);
    if (query.fairName) filters.push(eq(tradeFairContacts.fairName, query.fairName));
    if (query.metByUserId) filters.push(eq(tradeFairContacts.metByUserId, query.metByUserId));
    if (query.divisionId) filters.push(eq(tradeFairContacts.divisionId, query.divisionId));
    if (query.q) {
      const term = `%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      filters.push(
        or(
          ilike(tradeFairContacts.companyName, term),
          ilike(tradeFairContacts.contactName, term),
          ilike(tradeFairContacts.email, term),
          ilike(tradeFairContacts.mobilePhone, term),
          ilike(tradeFairContacts.province, term),
          ilike(tradeFairContacts.productType, term),
          ilike(tradeFairContacts.productCategory, term),
          exists(
            this.db
              .select({ one: sql`1` })
              .from(tradeFairContactProducts)
              .innerJoin(productModels, eq(tradeFairContactProducts.productModelId, productModels.id))
              .where(and(eq(tradeFairContactProducts.tradeFairContactId, tradeFairContacts.id), ilike(productModels.fullName, term)))
          )
        )!
      );
    }
    const where = and(...filters);
    const [rows, [{ total }]] = await Promise.all([
      this.db
        // Firma adı görünürlük süzgeci olmadan etiket olarak döner; firmaya gitmek
        // yine firma ekranının kendi yetki kontrolünden geçer.
        .select({
          row: tradeFairContacts,
          metByName: users.fullName,
          linkedCompanyName: companies.legalTitle,
          divisionName: divisions.name,
        })
        .from(tradeFairContacts)
        .leftJoin(users, eq(tradeFairContacts.metByUserId, users.id))
        // Firmalar yumuşak silinir (FK tetiklenmez); silinmiş firma "bağlı" görünmesin.
        .leftJoin(companies, and(eq(tradeFairContacts.companyId, companies.id), isNull(companies.deletedAt)))
        .leftJoin(divisions, eq(tradeFairContacts.divisionId, divisions.id))
        .where(where)
        .orderBy(desc(tradeFairContacts.createdAt))
        .limit(limit)
        .offset(offset),
      this.db.select({ total: count() }).from(tradeFairContacts).where(where),
    ]);
    const products = await this.productsFor(rows.map((r) => r.row.id));
    return buildPaginated(
      rows.map(({ row, metByName, linkedCompanyName, divisionName }) => ({
        ...row,
        metByName,
        linkedCompanyName,
        divisionName,
        products: products.get(row.id) ?? [],
      })),
      total,
      query
    );
  }

  /**
   * "Kim kaç kişiyle görüştü": seçili fuarda çalışan başına kayıt sayısı ve
   * görüşülen toplam kişi. Fuar listesi filtre için aynı yanıtta döner.
   */
  async summary(actor: AuthContext, fairName?: string) {
    const filters = this.baseFilters(actor);
    if (fairName) filters.push(eq(tradeFairContacts.fairName, fairName));
    const [fairs, byUser] = await Promise.all([
      this.db
        .select({ name: tradeFairContacts.fairName, total: count(), lastAt: sql<string>`max(${tradeFairContacts.createdAt})` })
        .from(tradeFairContacts)
        .where(and(...this.baseFilters(actor)))
        .groupBy(tradeFairContacts.fairName)
        .orderBy(desc(sql`max(${tradeFairContacts.createdAt})`)),
      this.db
        .select({
          userId: tradeFairContacts.metByUserId,
          fullName: users.fullName,
          meetings: count(),
          people: sql<number>`coalesce(sum(${tradeFairContacts.visitorCount}), 0)::int`,
        })
        .from(tradeFairContacts)
        .leftJoin(users, eq(tradeFairContacts.metByUserId, users.id))
        .where(and(...filters))
        .groupBy(tradeFairContacts.metByUserId, users.fullName)
        .orderBy(desc(count())),
    ]);
    return { fairs, byUser };
  }

  /** "Görüşen" seçimi için kiracının aktif kullanıcıları. */
  staff(actor: AuthContext) {
    return this.db
      .select({ id: users.id, fullName: users.fullName })
      .from(users)
      .where(and(eq(users.tenantId, actor.tenantId), eq(users.status, 'active'), isNull(users.deletedAt)))
      .orderBy(asc(users.fullName));
  }

  private async find(actor: AuthContext, id: string) {
    const [row] = await this.db
      .select()
      .from(tradeFairContacts)
      .where(and(eq(tradeFairContacts.id, id), ...this.baseFilters(actor)))
      .limit(1);
    if (!row) throw new NotFoundError('Fuar kaydı');
    return row;
  }

  async create(actor: AuthContext, input: TradeFairContactInput) {
    const metByUserId = input.metByUserId ?? actor.userId;
    await this.assertTenantUser(actor, metByUserId);
    await this.assertTenantDivision(actor, input.divisionId);
    const productModelIds = await this.validateProducts(actor, null, input.productModelIds ?? []);
    // Kayıt ve ürünleri tek işlemde: ürün yazımı düşerse yarım kayıt kalmasın.
    const row = await this.db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(tradeFairContacts)
        .values({
          ...this.normalize(input),
          tenantId: actor.tenantId,
          metByUserId,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        })
        .returning();
      await this.writeProducts(tx, actor, inserted.id, productModelIds);
      return inserted;
    });
    await this.log(actor, 'created', row.id, undefined, { ...row, productModelIds });
    return this.withProducts(row);
  }

  async update(actor: AuthContext, id: string, input: TradeFairContactUpdateInput) {
    const before = await this.find(actor, id);
    // Yalnız değiştiyse doğrula: görüşen çalışan sonradan silinmiş olabilir ve
    // form bu değeri geri gönderir; kayıt yine düzenlenebilmeli.
    if (input.metByUserId !== before.metByUserId) await this.assertTenantUser(actor, input.metByUserId);
    if (input.divisionId !== before.divisionId) await this.assertTenantDivision(actor, input.divisionId);
    // Ürünler satır yazılmadan önce doğrulanır; geçersiz üründe hiçbir alan kaydedilmez.
    // Ürün listesi gönderilmediyse (kısmi PATCH) dokunulmaz.
    const productModelIds = input.productModelIds ? await this.validateProducts(actor, id, input.productModelIds) : undefined;
    const beforeProducts = productModelIds ? await this.productIdsOf(id) : undefined;
    const row = await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(tradeFairContacts)
        .set({ ...this.normalize(input), updatedBy: actor.userId })
        .where(and(eq(tradeFairContacts.id, id), eq(tradeFairContacts.tenantId, actor.tenantId)))
        .returning();
      if (productModelIds) await this.writeProducts(tx, actor, id, productModelIds);
      return updated;
    });
    await this.log(
      actor,
      'updated',
      id,
      beforeProducts ? { ...before, productModelIds: beforeProducts } : before,
      productModelIds ? { ...row, productModelIds } : row
    );
    return this.withProducts(row);
  }

  async remove(actor: AuthContext, id: string) {
    const row = await this.find(actor, id);
    if (!this.isManager(actor) && row.createdBy !== actor.userId) {
      throw new ForbiddenError('Yalnız kendi eklediğiniz fuar kaydını silebilirsiniz');
    }
    await this.db
      .update(tradeFairContacts)
      .set({ deletedAt: new Date(), updatedBy: actor.userId })
      .where(eq(tradeFairContacts.id, id));
    await this.log(actor, 'deleted', id, row);
    return { deleted: true };
  }

  private async withProducts<T extends { id: string }>(row: T) {
    const products = await this.productsFor([row.id]);
    return { ...row, products: products.get(row.id) ?? [] };
  }

  /**
   * Fuar kaydını Firmalar'a ekler. `companyId` verilirse mevcut firmaya kontak
   * açılır; verilmezse kayıttaki ünvan/konumla yeni (potansiyel, kaynağı Fuar)
   * firma açılır. Firma ve kontak kendi servislerinden geçer: mükerrer ünvan,
   * bölüm ve yetki kuralları normal firma ekleme ile aynı işler.
   */
  async addToCompanies(actor: AuthContext, id: string, input: TradeFairToCompanyInput) {
    const can = (permission: string) => actor.roles.includes('super_admin') || actor.permissions.has(permission);
    // Satır kilidi: aynı kayda eşzamanlı iki istek (çift tıklama) ikinci kontağı açmasın;
    // ikinci istek birincinin işlemi bitince güncel satırı görür ve 409 alır.
    // Firma/kontak servisleri kendi bağlantılarını kullanır ve bu tabloya dokunmaz,
    // bu yüzden kilit onları bekletmez.
    const outcome = await this.db.transaction(async (tx) => {
      const [record] = await tx
        .select()
        .from(tradeFairContacts)
        .where(and(eq(tradeFairContacts.id, id), ...this.baseFilters(actor)))
        .for('update');
      if (!record) throw new NotFoundError('Fuar kaydı');

      // Firmalar yumuşak silinir; silinmiş firmaya bağ yok sayılır, kayıt yeniden eklenebilir.
      let linkedCompanyId: string | null = null;
      if (record.companyId) {
        const [alive] = await tx
          .select({ id: companies.id })
          .from(companies)
          .where(and(eq(companies.id, record.companyId), isNull(companies.deletedAt)))
          .limit(1);
        linkedCompanyId = alive?.id ?? null;
      }
      if (linkedCompanyId && record.contactId) {
        throw new ConflictError('Bu fuar kaydı zaten Firmalar\'a eklendi', { companyId: linkedCompanyId });
      }
      // Önceki denemede firma açılıp kontak adımı düştüyse aynı firmayla devam edilir.
      const resuming = !!linkedCompanyId;
      if (!can('contacts.create') || (!resuming && !input.companyId && !can('companies.create'))) {
        throw new ForbiddenError('Firmalara ekleme yetkiniz yok');
      }

      let companyId = linkedCompanyId ?? input.companyId;
      if (companyId) {
        // Görünürlük kontrolü: kullanıcının göremediği firmaya kontak eklenemez.
        await this.companiesService.get(companyId, actor);
      } else {
        const hasFairSource = await lookupIdByCode(this.db, contactSources, 'fair');
        const parsed = companyCreateSchema.safeParse({
          legalTitle: record.companyName,
          // Firma, fuar kaydında seçilen bölümde açılır (kullanıcı başka bölüm seçmediyse).
          divisionIds: input.divisionIds ?? (record.divisionId ? [record.divisionId] : undefined),
          relationTypeCode: 'customer',
          customerStatusCode: 'potential',
          ...(hasFairSource ? { contactSourceCode: 'fair' } : { contactSourceText: 'Fuar' }),
          notes: `Fuar: ${record.fairName}`,
          address: { country: record.country, province: record.province ?? undefined, district: record.district ?? undefined },
        });
        if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'Firma bilgisi geçersiz');
        companyId = (await this.companiesService.create(parsed.data, actor)).id;
      }

      // Serbest girilmiş telefon/e-posta kontak şemasına uymuyorsa o alan boş kalır;
      // not, fuar önekiyle birlikte kontak notu sınırına kırpılır.
      const phone = phoneSchema.safeParse(record.mobilePhone ?? '');
      const email = emailSchema.safeParse(record.email ?? '');
      const contactInput = contactCreateSchema.safeParse({
        companyId,
        fullName: record.contactName,
        title: record.contactTitle ?? undefined,
        mobilePhone: phone.success ? phone.data : undefined,
        workEmail: email.success ? email.data : undefined,
        notes: [`Fuar: ${record.fairName}`, record.notes].filter(Boolean).join('\n').slice(0, 4000),
      });
      try {
        if (!contactInput.success) throw new ValidationError(contactInput.error.issues[0]?.message ?? 'Kontak bilgisi geçersiz');
        const contact = await this.contactsService.create(contactInput.data, actor);
        // Fuarda eklenen fotoğraf/dosyalar firma kartında da görünsün: aynı dosyalar firmaya da bağlanır.
        const links = await tx
          .select({ fileId: fileLinks.fileId, documentTypeId: fileLinks.documentTypeId, description: fileLinks.description })
          .from(fileLinks)
          .where(and(eq(fileLinks.tenantId, actor.tenantId), eq(fileLinks.entityType, 'trade_fair_contact'), eq(fileLinks.entityId, id)));
        if (links.length) {
          await tx.insert(fileLinks).values(
            links.map((link) => ({ ...link, tenantId: actor.tenantId, entityType: 'company', entityId: companyId! }))
          );
        }
        const [row] = await tx
          .update(tradeFairContacts)
          .set({ companyId, contactId: contact.id, updatedBy: actor.userId })
          .where(eq(tradeFairContacts.id, id))
          .returning();
        return { row, companyId, contactId: contact.id, previousCompanyId: record.companyId };
      } catch (error) {
        // Firma açıldı ama kontak düştü: bağ yine kaydedilir ki tekrar denemede ikinci
        // firma açılmasın, aynı firmayla kontak adımından devam edilsin.
        await tx.update(tradeFairContacts).set({ companyId, updatedBy: actor.userId }).where(eq(tradeFairContacts.id, id));
        return { error };
      }
    });
    if ('error' in outcome) throw outcome.error;

    await this.log(actor, 'added_to_companies', id, { companyId: outcome.previousCompanyId }, { companyId: outcome.companyId, contactId: outcome.contactId });
    // Arayüz "Firmalar'a eklendi: <ünvan>" gösterir; ünvan firma servisinin normalize ettiği hâl.
    const [company] = await this.db.select({ legalTitle: companies.legalTitle }).from(companies).where(eq(companies.id, outcome.companyId!)).limit(1);
    return { ...(await this.withProducts(outcome.row)), linkedCompanyName: company?.legalTitle ?? null };
  }
}
