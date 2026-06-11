import { Body, Controller, Get, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { and, desc, eq, ilike, isNull, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import { competitors, competitorProducts } from '../../db/schema/crm';
import { DB } from '../../shared/database/database.module';
import {
  competitorCreateSchema,
  competitorProductCreateSchema,
  competitorUpdateSchema,
  paginationSchema,
  type CompetitorCreateInput,
  type CompetitorProductCreateInput,
  type CompetitorUpdateInput,
  type Pagination,
} from '@haksan/shared';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { AuthGuard } from '../../shared/security/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../shared/security/permissions.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { NotFoundError } from '../../shared/utils/errors';
import { buildPaginated, pageOffset } from '../../shared/utils/pagination';
import { AuditService } from '../../shared/database/audit.service';

const competitorListQuery = z.object({ search: z.string().max(128).optional() });

@UseGuards(AuthGuard, PermissionsGuard)
@Controller()
export class CompetitorsController {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly audit: AuditService
  ) {}

  @RequirePermissions('competitors.read')
  @Get('competitors')
  async list(
    @Query(new ZodValidationPipe(competitorListQuery.merge(paginationSchema)))
    qp: z.infer<typeof competitorListQuery> & Pagination,
    @CurrentUser() user: AuthContext
  ) {
    const { page, pageSize, sortBy, sortDir, search } = qp;
    const { limit, offset } = pageOffset({ page, pageSize, sortBy, sortDir });
    const filters = [eq(competitors.tenantId, user.tenantId), isNull(competitors.deletedAt)];
    if (search) filters.push(ilike(competitors.name, `%${search}%`));
    const where = and(...filters);
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(competitors).where(where);
    const rows = await this.db.select().from(competitors).where(where).orderBy(desc(competitors.createdAt)).limit(limit).offset(offset);
    return buildPaginated(rows, count, { page, pageSize, sortBy, sortDir });
  }

  @RequirePermissions('competitors.create')
  @Post('competitors')
  async create(@Body(new ZodValidationPipe(competitorCreateSchema)) body: CompetitorCreateInput, @CurrentUser() user: AuthContext) {
    const [row] = await this.db
      .insert(competitors)
      .values({
        tenantId: user.tenantId,
        name: body.name,
        website: body.website ?? null,
        notes: body.notes ?? null,
      })
      .returning();
    await this.audit.write({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action: 'competitor.created',
      resourceType: 'competitor',
      resourceId: row.id,
      newValues: { name: row.name },
    });
    return row;
  }

  @RequirePermissions('competitors.update')
  @Patch('competitors/:id')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(competitorUpdateSchema)) body: CompetitorUpdateInput,
    @CurrentUser() user: AuthContext
  ) {
    const existing = await this.db.query.competitors.findFirst({
      where: and(eq(competitors.id, id), eq(competitors.tenantId, user.tenantId), isNull(competitors.deletedAt)),
    });
    if (!existing) throw new NotFoundError('Rakip');
    const patch: Record<string, unknown> = {};
    for (const k of ['name', 'website', 'notes'] as const) {
      if (body[k] !== undefined) patch[k] = body[k] ?? null;
    }
    await this.db.update(competitors).set(patch).where(eq(competitors.id, id));
    await this.audit.write({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action: 'competitor.updated',
      resourceType: 'competitor',
      resourceId: id,
      oldValues: existing,
      newValues: patch,
    });
    return this.db.query.competitors.findFirst({ where: eq(competitors.id, id) });
  }

  @RequirePermissions('competitors.read')
  @Get('competitors/:id/products')
  async listProducts(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    await this.assertCompetitor(id, user);
    return this.db
      .select()
      .from(competitorProducts)
      .where(and(eq(competitorProducts.competitorId, id), eq(competitorProducts.tenantId, user.tenantId), isNull(competitorProducts.deletedAt)))
      .orderBy(desc(competitorProducts.createdAt));
  }

  @RequirePermissions('competitors.create')
  @Post('competitors/:id/products')
  async createProduct(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(competitorProductCreateSchema)) body: CompetitorProductCreateInput,
    @CurrentUser() user: AuthContext
  ) {
    await this.assertCompetitor(id, user);
    const [row] = await this.db
      .insert(competitorProducts)
      .values({
        tenantId: user.tenantId,
        competitorId: id,
        modelCode: body.modelCode ?? null,
        modelName: body.modelName,
        notes: body.notes ?? null,
      })
      .returning();
    await this.audit.write({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action: 'competitor_product.created',
      resourceType: 'competitor_product',
      resourceId: row.id,
      newValues: { competitorId: id, modelName: row.modelName },
    });
    return row;
  }

  private async assertCompetitor(id: string, user: AuthContext) {
    const existing = await this.db.query.competitors.findFirst({
      where: and(eq(competitors.id, id), eq(competitors.tenantId, user.tenantId), isNull(competitors.deletedAt)),
    });
    if (!existing) throw new NotFoundError('Rakip');
    return existing;
  }
}
