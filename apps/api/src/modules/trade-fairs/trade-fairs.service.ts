import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, ilike, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { TradeFairContactInput, TradeFairContactUpdateInput, TradeFairListQuery } from '@haksan/shared';
import type { DbClient } from '../../db/client';
import { tradeFairContacts, users } from '../../db/schema';
import { DB } from '../../shared/database/database.module';
import { AuditService } from '../../shared/database/audit.service';
import type { AuthContext } from '../../shared/security/auth.types';
import { buildPaginated, pageOffset } from '../../shared/utils/pagination';
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
      ...('notes' in input ? { notes: emptyToNull(input.notes) } : {}),
    };
  }

  async list(actor: AuthContext, query: TradeFairListQuery) {
    const { limit, offset } = pageOffset(query);
    const filters = this.baseFilters(actor);
    if (query.fairName) filters.push(eq(tradeFairContacts.fairName, query.fairName));
    if (query.metByUserId) filters.push(eq(tradeFairContacts.metByUserId, query.metByUserId));
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
    const where = and(...filters);
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({ row: tradeFairContacts, metByName: users.fullName })
        .from(tradeFairContacts)
        .leftJoin(users, eq(tradeFairContacts.metByUserId, users.id))
        .where(where)
        .orderBy(desc(tradeFairContacts.createdAt))
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
    // Yalnız değiştiyse doğrula: görüşen çalışan sonradan silinmiş olabilir ve
    // form bu değeri geri gönderir; kayıt yine düzenlenebilmeli.
    if (input.metByUserId !== before.metByUserId) await this.assertTenantUser(actor, input.metByUserId);
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
