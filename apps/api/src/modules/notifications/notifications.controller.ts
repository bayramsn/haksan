import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DbClient } from '../../db/client';
import { companies, companyAccessRequests, notifications } from '../../db/schema/companies';
import { salesActivities } from '../../db/schema/crm';
import { roles, userRoles, users } from '../../db/schema/users';
import { DB } from '../../shared/database/database.module';
import { PushService } from '../../shared/push/push.service';
import { AuthGuard } from '../../shared/security/auth.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { divisionFilter, resolveActorDivisionScope } from '../../shared/utils/division-scope';
import { buildPaginated, pageOffset } from '../../shared/utils/pagination';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { paginationSchema } from '@haksan/shared';
import { ConflictError, NotFoundError } from '../../shared/utils/errors';

const notificationListQuery = paginationSchema.extend({
  unread: z.coerce.boolean().optional(),
});

export type NotificationTarget =
  | { kind: 'company'; companyId: string }
  | { kind: 'opportunity'; opportunityId: string; activityId?: string }
  | { kind: 'navigate'; nav: string; query?: string };

const pushTokenSchema = z.object({
  token: z.string().min(10).max(255),
  platform: z.enum(['expo', 'ios', 'android']).default('expo'),
});

const notificationActionResponseSchema = z
  .object({
    decision: z.enum(['yes', 'no']),
    reason: z.string().trim().min(3).max(1000).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.decision === 'no' && !value.reason) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'Hayır yanıtında neden zorunludur' });
    }
  });

@UseGuards(AuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly push: PushService,
  ) {}

  /** Mobil cihaz push token'ını kaydeder (giriş sonrası). */
  @Post('push-token')
  async registerPushToken(
    @Body(new ZodValidationPipe(pushTokenSchema)) body: z.infer<typeof pushTokenSchema>,
    @CurrentUser() user: AuthContext,
  ) {
    await this.push.registerToken(user.tenantId, user.userId, body.token, body.platform);
    return { ok: true };
  }

  /** Çıkışta cihaz token'ını kaldırır. */
  @Delete('push-token')
  async removePushToken(
    @Body(new ZodValidationPipe(pushTokenSchema.pick({ token: true }))) body: { token: string },
    @CurrentUser() user: AuthContext,
  ) {
    await this.push.removeToken(user.tenantId, user.userId, body.token);
    return { ok: true };
  }

  /**
   * Bildirimin tıklanınca açılacağı yer. entityType/entityId tek başına arayüz
   * için yetersiz (ör. bir aktivite kimliği hangi karta ait belli değil), bu
   * yüzden hedef burada çözülüp listeye eklenir.
   */
  private async resolveTargets(
    rows: Array<{ entityType: string | null; entityId: string | null }>,
    tenantId: string,
  ): Promise<Map<string, NotificationTarget>> {
    const targets = new Map<string, NotificationTarget>();
    const idsFor = (entityType: string) => [
      ...new Set(rows.filter((r) => r.entityType === entityType && r.entityId).map((r) => r.entityId!)),
    ];

    const activityIds = idsFor('activity');
    if (activityIds.length) {
      const activityRows = await this.db
        .select({
          id: salesActivities.id,
          opportunityId: salesActivities.opportunityId,
          companyId: salesActivities.companyId,
        })
        .from(salesActivities)
        .where(and(eq(salesActivities.tenantId, tenantId), inArray(salesActivities.id, activityIds)));
      for (const row of activityRows) {
        if (row.opportunityId) {
          targets.set(`activity:${row.id}`, {
            kind: 'opportunity',
            opportunityId: row.opportunityId,
            activityId: row.id,
          });
        }
        else if (row.companyId) targets.set(`activity:${row.id}`, { kind: 'company', companyId: row.companyId });
      }
    }

    const accessRequestIds = idsFor('company_access_request');
    if (accessRequestIds.length) {
      const requestRows = await this.db
        .select({ id: companyAccessRequests.id, companyId: companyAccessRequests.companyId })
        .from(companyAccessRequests)
        .where(and(eq(companyAccessRequests.tenantId, tenantId), inArray(companyAccessRequests.id, accessRequestIds)));
      for (const row of requestRows) {
        if (row.companyId) targets.set(`company_access_request:${row.id}`, { kind: 'company', companyId: row.companyId });
      }
    }

    return targets;
  }

  private targetFor(
    row: { entityType: string | null; entityId: string | null },
    resolved: Map<string, NotificationTarget>,
  ): NotificationTarget | null {
    if (!row.entityType) return null;
    const direct = row.entityId ? resolved.get(`${row.entityType}:${row.entityId}`) : undefined;
    if (direct) return direct;
    switch (row.entityType) {
      case 'service_complaint_intake':
        return row.entityId
          ? { kind: 'navigate', nav: 'service-requests', query: `complaint:${row.entityId}` }
          : { kind: 'navigate', nav: 'service-requests' };
      case 'weekly_sales_report':
        return { kind: 'navigate', nav: 'reports', query: 'weekly-sales' };
      case 'company':
        return row.entityId ? { kind: 'company', companyId: row.entityId } : null;
      case 'opportunity':
        return row.entityId ? { kind: 'opportunity', opportunityId: row.entityId } : null;
      default:
        return null;
    }
  }

  private visibleFilter(user: AuthContext) {
    const divisionScope = divisionFilter(resolveActorDivisionScope(user), notifications.divisionId);
    return or(eq(notifications.userId, user.userId), and(isNull(notifications.userId), divisionScope ?? sql`true`));
  }

  @Get()
  async list(@Query(new ZodValidationPipe(notificationListQuery)) query: z.infer<typeof notificationListQuery>, @CurrentUser() user: AuthContext) {
    const { limit, offset } = pageOffset(query);
    const filters = [eq(notifications.tenantId, user.tenantId), this.visibleFilter(user)];
    if (query.unread) filters.push(isNull(notifications.readAt));
    const where = and(...filters);
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(notifications).where(where);
    const rows = await this.db
      .select()
      .from(notifications)
      .where(where)
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset);
    const resolved = await this.resolveTargets(rows, user.tenantId);
    return buildPaginated(
      rows.map((row) => ({ ...row, target: this.targetFor(row, resolved) })),
      count,
      query,
    );
  }

  @Patch(':id/read')
  async markRead(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    const [row] = await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.id, id),
          eq(notifications.tenantId, user.tenantId),
          this.visibleFilter(user),
          or(isNull(notifications.actionStatus), ne(notifications.actionStatus, 'pending')),
        ),
      )
      .returning();
    if (!row) {
      const [existing] = await this.db
        .select({ id: notifications.id, actionStatus: notifications.actionStatus })
        .from(notifications)
        .where(and(eq(notifications.id, id), eq(notifications.tenantId, user.tenantId), this.visibleFilter(user)))
        .limit(1);
      if (!existing) throw new NotFoundError('Bildirim');
      if (existing.actionStatus === 'pending') {
        throw new ConflictError('Bu bildirim Evet veya Hayır yanıtı verilmeden kapatılamaz');
      }
    }
    return row;
  }

  /**
   * Yanıt bekleyen yakın-firma bildirimini atomik biçimde sonuçlandırır.
   * Hayır yanıtı yalnız neden ile kabul edilir ve neden tenant'ın aktif süper
   * yöneticilerine ayrı bir CRM bildirimi (ve varsa push) olarak iletilir.
   */
  @Post(':id/respond')
  async respond(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(notificationActionResponseSchema))
    body: z.infer<typeof notificationActionResponseSchema>,
    @CurrentUser() user: AuthContext,
  ) {
    const now = new Date();
    const reason = body.decision === 'no' ? body.reason!.trim() : null;
    const superAdminIds: string[] = [];

    const row = await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(notifications)
        .set({
          actionStatus: body.decision === 'yes' ? 'accepted' : 'declined',
          responseReason: reason,
          respondedAt: now,
          readAt: now,
        })
        .where(
          and(
            eq(notifications.id, id),
            eq(notifications.tenantId, user.tenantId),
            eq(notifications.userId, user.userId),
            eq(notifications.actionType, 'visit_intent'),
            eq(notifications.actionStatus, 'pending'),
          ),
        )
        .returning();

      if (!updated) {
        const [existing] = await tx
          .select({ id: notifications.id, actionStatus: notifications.actionStatus })
          .from(notifications)
          .where(
            and(
              eq(notifications.id, id),
              eq(notifications.tenantId, user.tenantId),
              eq(notifications.userId, user.userId),
            ),
          )
          .limit(1);
        if (!existing) throw new NotFoundError('Bildirim');
        throw new ConflictError('Bu bildirim daha önce yanıtlanmış veya yanıtlanabilir türde değil');
      }

      if (body.decision === 'no') {
        const [actorRow, companyRow, admins] = await Promise.all([
          tx
            .select({ fullName: users.fullName })
            .from(users)
            .where(and(eq(users.id, user.userId), eq(users.tenantId, user.tenantId)))
            .limit(1),
          updated.entityId
            ? tx
                .select({ legalTitle: companies.legalTitle, shortName: companies.shortName })
                .from(companies)
                .where(and(eq(companies.id, updated.entityId), eq(companies.tenantId, user.tenantId)))
                .limit(1)
            : Promise.resolve([]),
          tx
            .selectDistinct({ userId: users.id })
            .from(users)
            .innerJoin(userRoles, eq(userRoles.userId, users.id))
            .innerJoin(roles, eq(userRoles.roleId, roles.id))
            .where(
              and(
                eq(users.tenantId, user.tenantId),
                eq(users.status, 'active'),
                isNull(users.deletedAt),
                eq(roles.tenantId, user.tenantId),
                eq(roles.code, 'super_admin'),
              ),
            ),
        ]);
        const actorName = actorRow[0]?.fullName ?? user.email;
        const companyName = companyRow[0]?.shortName || companyRow[0]?.legalTitle || 'Yakındaki firma';
        superAdminIds.push(...admins.map((admin) => admin.userId));
        if (superAdminIds.length > 0) {
          await tx.insert(notifications).values(
            superAdminIds.map((userId) => ({
              tenantId: user.tenantId,
              userId,
              type: 'nearby_visit_declined',
              title: 'Yakın firma ziyareti reddedildi',
              body: `${actorName}, ${companyName} firmasına gitmeyeceğini bildirdi. Neden: ${reason}`,
              entityType: updated.entityType,
              entityId: updated.entityId,
            })),
          );
        }
      }

      return updated;
    });

    if (body.decision === 'no' && superAdminIds.length > 0) {
      const pushBody = `${user.email}: ${reason}`;
      await Promise.allSettled(
        superAdminIds.map((userId) =>
          this.push.sendToUser(userId, {
            title: 'Yakın firma ziyareti reddedildi',
            body: pushBody,
            data: row.entityId ? { kind: 'company', companyId: row.entityId } : undefined,
          }),
        ),
      );
    }

    return row;
  }
}
