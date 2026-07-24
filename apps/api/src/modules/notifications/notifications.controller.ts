import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DbClient } from '../../db/client';
import { notifications } from '../../db/schema/companies';
import { DB } from '../../shared/database/database.module';
import { PushService } from '../../shared/push/push.service';
import { AuthGuard } from '../../shared/security/auth.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { divisionFilter, resolveActorDivisionScope } from '../../shared/utils/division-scope';
import { buildPaginated, pageOffset } from '../../shared/utils/pagination';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { paginationSchema } from '@haksan/shared';

const notificationListQuery = paginationSchema.extend({
  unread: z.coerce.boolean().optional(),
});

const pushTokenSchema = z.object({
  token: z.string().min(10).max(255),
  platform: z.enum(['expo', 'ios', 'android']).default('expo'),
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
  async removePushToken(@Body(new ZodValidationPipe(pushTokenSchema.pick({ token: true }))) body: { token: string }) {
    await this.push.removeToken(body.token);
    return { ok: true };
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
    return buildPaginated(rows, count, query);
  }

  @Patch(':id/read')
  async markRead(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    const [row] = await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.id, id), eq(notifications.tenantId, user.tenantId), this.visibleFilter(user)))
      .returning();
    return row;
  }
}
