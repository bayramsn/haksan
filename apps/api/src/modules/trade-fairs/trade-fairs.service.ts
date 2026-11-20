import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, ilike, isNull, or, sql, type SQL } from 'drizzle-orm';
import { tradeFairFollowUpSchema } from '@haksan/shared';
import type { TradeFairContactInput, TradeFairContactUpdateInput, TradeFairListQuery } from '@haksan/shared';
import type { DbClient } from '../../db/client';
import { files, fileLinks } from '../../db/schema/files';
import { tradeFairContacts, users } from '../../db/schema';
import { DB } from '../../shared/database/database.module';
import { AuditService } from '../../shared/database/audit.service';
import type { AuthContext } from '../../shared/security/auth.types';
import { buildPaginated, pageOffset } from '../../shared/utils/pagination';
import { companyNameKey, companyNameKeySql } from '../../shared/utils/text-normalization';
import { isoDate, type ExportRow } from '../../shared/utils/excel-export';
import { ForbiddenError, NotFoundError, ValidationError } from '../../shared/utils/errors';

const emptyToNull = (value: string | null | undefined) => (value?.trim() ? value.trim() : null);

/**
 * Fuar görüşmeleri. Kiracı içinde herkes her kaydı görür ve düzenler;
 * silme yalnız kaydı açana veya yöneticiye açık.
 */
@Injectable()
export class TradeFairsService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly audit: AuditService
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

  private normalize<T extends TradeFairContactUpdateInput>(input: T) {
    return {
      ...input,
      ...('contactTitle' in input ? { contactTitle: emptyToNull(input.contactTitle) } : {}),
      ...('mobilePhone' in input ? { mobilePhone: emptyToNull(input.mobilePhone) } : {}),
      ...('email' in input ? { email: emptyToNull(input.email) } : {}),
      ...('province' in input ? { province: emptyToNull(input.province) } : {}),
      ...('district' in input ? { district: emptyToNull(input.district) } : {}),
      ...('productCategory' in input ? { productCategory: emptyToNull(input.productCategory) } : {}),
      ...('productType' in input ? { productType: emptyToNull(input.productType) } : {}),
      ...('contactNotes' in input ? { contactNotes: emptyToNull(input.contactNotes) } : {}),
      ...('notes' in input ? { notes: emptyToNull(input.notes) } : {}),
    };
  }

  private listFilters(actor: AuthContext, query: Pick<TradeFairListQuery, 'fairName' | 'q' | 'metByUserId' | 'province'> & { photosOnly?: boolean }) {
    const filters = this.baseFilters(actor);
    if (query.photosOnly) filters.push(sql`exists (
      select 1 from ${fileLinks} inner join ${files}
      on ${files.id} = ${fileLinks.fileId} and ${files.tenantId} = ${fileLinks.tenantId}
      where ${fileLinks.tenantId} = ${tradeFairContacts.tenantId}
        and ${fileLinks.entityId} = ${tradeFairContacts.id}
        and ${fileLinks.entityType} = 'trade_fair_contact'
        and ${files.deletedAt} is null and ${files.uploadStatus} = 'linked'
        and ${files.mimeType} like 'image/%'
    )`);
    if (query.fairName) filters.push(eq(tradeFairContacts.fairName, query.fairName));
    if (query.metByUserId) filters.push(eq(tradeFairContacts.metByUserId, query.metByUserId));
    if (query.province?.trim()) filters.push(eq(companyNameKeySql(tradeFairContacts.province), companyNameKey(query.province)));
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
          ilike(tradeFairContacts.productCategory, term)
        )!
      );
    }
    return filters;
  }

  async exportRows(actor: AuthContext, query: Pick<TradeFairListQuery, 'fairName' | 'q' | 'metByUserId' | 'province'>): Promise<ExportRow[]> {
    const rows = await this.db.select({ row: tradeFairContacts, metByName: users.fullName })
      .from(tradeFairContacts)
      .leftJoin(users, eq(tradeFairContacts.metByUserId, users.id))
      .where(and(...this.listFilters(actor, query)))
      .orderBy(desc(tradeFairContacts.createdAt))
      .limit(10_001);
    if (rows.length > 10_000) throw new ValidationError('Excel için en fazla 10000 kayıt seçilebilir; filtreleri daraltın');
    return rows.map(({ row, metByName }) => ({
      Fuar: row.fairName, Firma: row.companyName, Yetkili: row.contactName,
      Unvan: row.contactTitle ?? '', Telefon: row.mobilePhone ?? '', 'E-posta': row.email ?? '',
      Ülke: row.country, Şehir: row.province ?? '', İlçe: row.district ?? '',
      'Ürün Kategorisi': row.productCategory ?? '', Ürün: row.productType ?? '',
      Görüşen: metByName ?? '', 'Kişi Sayısı': row.visitorCount,
      'İletişime Geçildi': row.contacted ? 'Evet' : 'Hayır',
      'Görüşme Tarihi': row.contactDate ?? '', 'Görüşme Notu': row.contactNotes ?? '',
      'Teklif Gönderildi': row.offerSent ? 'Evet' : 'Hayır',
      'Müşteriye Dönüştü': row.customerConverted ? 'Evet' : 'Hayır', Notlar: row.notes ?? '',
      'Kayıt Tarihi': isoDate(row.createdAt),
    }));
  }

  async list(actor: AuthContext, query: TradeFairListQuery & { photosOnly?: boolean }) {
    const { limit, offset } = pageOffset(query);
    const where = and(...this.listFilters(actor, query));
    const sortColumns = {
      name: tradeFairContacts.companyName,
      communication: sql<string>`coalesce(nullif(${tradeFairContacts.mobilePhone}, ''), ${tradeFairContacts.email})`,
      location: sql<string>`concat_ws(' / ', nullif(${tradeFairContacts.district}, ''), nullif(${tradeFairContacts.province}, ''), case when ${tradeFairContacts.country} <> 'Türkiye' then nullif(${tradeFairContacts.country}, '') end)`,
      product: tradeFairContacts.productType,
      staff: users.fullName,
      followUp: tradeFairContacts.contacted,
      createdAt: tradeFairContacts.createdAt,
    };
    const column = sortColumns[query.sortBy ?? 'createdAt'];
    const direction = query.sortDir === 'asc' ? asc : desc;
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({ row: tradeFairContacts, metByName: users.fullName })
        .from(tradeFairContacts)
        .leftJoin(users, eq(tradeFairContacts.metByUserId, users.id))
        .where(where)
        .orderBy(direction(column), direction(tradeFairContacts.id))
        .limit(limit)
        .offset(offset),
      this.db.select({ total: count() }).from(tradeFairContacts).where(where),
    ]);
    return buildPaginated(
      rows.map(({ row, metByName }) => ({ ...row, metByName })),
      total,
      query
    );
  }

  /** Photo metadata uses the same tenant and active-record boundaries as the list. */
  async photos(actor: AuthContext) {
    const rows = await this.db.select({
      id: fileLinks.id, fileId: files.id, filename: files.originalFilename,
      mimeType: files.mimeType, uploadedBy: files.uploadedBy,
      record: tradeFairContacts, metByName: users.fullName,
    }).from(fileLinks)
      .innerJoin(files, and(eq(files.id, fileLinks.fileId), eq(files.tenantId, fileLinks.tenantId)))
      .innerJoin(tradeFairContacts, and(eq(tradeFairContacts.id, fileLinks.entityId), eq(tradeFairContacts.tenantId, fileLinks.tenantId)))
      .leftJoin(users, and(eq(users.id, tradeFairContacts.metByUserId), eq(users.tenantId, actor.tenantId)))
      .where(and(...this.baseFilters(actor), eq(fileLinks.tenantId, actor.tenantId),
        eq(fileLinks.entityType, 'trade_fair_contact'), eq(files.uploadStatus, 'linked'),
        isNull(files.deletedAt), sql`${files.mimeType} like 'image/%'`))
      .orderBy(desc(tradeFairContacts.createdAt), asc(fileLinks.id)).limit(5001);
    if (rows.length > 5000) throw new ValidationError('Galeri en fazla 5000 fotoğraf gösterebilir');
    return rows.map(({ record, metByName, ...file }) => ({ ...file, record: { ...record, metByName } }));
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

  private validateFollowUp(input: unknown) {
    const result = tradeFairFollowUpSchema.safeParse(input);
    if (!result.success) throw new ValidationError(result.error.issues[0].message);
  }

  async create(actor: AuthContext, input: TradeFairContactInput) {
    this.validateFollowUp(input);
    const metByUserId = input.metByUserId ?? actor.userId;
    await this.assertTenantUser(actor, metByUserId);
    const [row] = await this.db
      .insert(tradeFairContacts)
      .values({
        ...this.normalize(input),
        tenantId: actor.tenantId,
        metByUserId,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      })
      .returning();
    await this.log(actor, 'created', row.id, undefined, row);
    return row;
  }

  async update(actor: AuthContext, id: string, input: TradeFairContactUpdateInput) {
    const before = await this.find(actor, id);
    this.validateFollowUp({ ...before, ...input });
    // Yalnız değiştiyse doğrula: görüşen çalışan sonradan silinmiş olabilir ve
    // form bu değeri geri gönderir; kayıt yine düzenlenebilmeli.
    if ('metByUserId' in input && input.metByUserId !== before.metByUserId) await this.assertTenantUser(actor, input.metByUserId);
    const [row] = await this.db
      .update(tradeFairContacts)
      .set({ ...this.normalize(input), updatedBy: actor.userId })
      .where(and(eq(tradeFairContacts.id, id), eq(tradeFairContacts.tenantId, actor.tenantId)))
      .returning();
    await this.log(actor, 'updated', id, before, row);
    return row;
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
}
