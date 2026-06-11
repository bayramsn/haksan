import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import {
  quoteCreateSchema,
  quoteUpdateSchema,
  quoteItemCreateSchema,
  quoteItemUpdateSchema,
  quoteTermsUpsertSchema,
  paginationSchema,
  type QuoteCreateInput,
  type QuoteUpdateInput,
  type QuoteItemCreateInput,
  type QuoteItemUpdateInput,
  type QuoteTermsUpsertInput,
  type Pagination,
} from '@haksan/shared';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { AuthGuard } from '../../shared/security/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../shared/security/permissions.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { QuotesService } from './quotes.service';

const listQuery = z.object({ search: z.string().optional(), statusCode: z.string().optional(), companyId: z.string().optional() });

@UseGuards(AuthGuard, PermissionsGuard)
@Controller('quotes')
export class QuotesController {
  constructor(private readonly svc: QuotesService) {}

  @RequirePermissions('quotes.read')
  @Get()
  list(
    @Query(new ZodValidationPipe(listQuery.merge(paginationSchema)))
    qp: z.infer<typeof listQuery> & Pagination,
    @CurrentUser() user: AuthContext
  ) {
    const { page, pageSize, sortBy, sortDir, ...query } = qp;
    return this.svc.list(user, query, { page, pageSize, sortBy, sortDir });
  }

  @RequirePermissions('quotes.read')
  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.svc.get(id, user);
  }

  @RequirePermissions('quotes.create')
  @Post()
  create(@Body(new ZodValidationPipe(quoteCreateSchema)) body: QuoteCreateInput, @CurrentUser() user: AuthContext) {
    return this.svc.create(body, user);
  }

  @RequirePermissions('quotes.update')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(quoteUpdateSchema)) body: QuoteUpdateInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.update(id, body, user);
  }

  @RequirePermissions('quotes.delete')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.svc.delete(id, user);
  }

  @RequirePermissions('quotes.update')
  @Post(':id/items')
  addItem(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(quoteItemCreateSchema)) body: QuoteItemCreateInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.addItem(id, body, user);
  }

  @RequirePermissions('quotes.update')
  @Patch(':id/items/:itemId')
  updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body(new ZodValidationPipe(quoteItemUpdateSchema)) body: QuoteItemUpdateInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.updateItem(id, itemId, body, user);
  }

  @RequirePermissions('quotes.update')
  @Delete(':id/items/:itemId')
  deleteItem(@Param('id') id: string, @Param('itemId') itemId: string, @CurrentUser() user: AuthContext) {
    return this.svc.deleteItem(id, itemId, user);
  }

  @RequirePermissions('quotes.update')
  @Put(':id/terms')
  upsertTerms(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(quoteTermsUpsertSchema)) body: QuoteTermsUpsertInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.upsertTerms(id, body, user);
  }

  @RequirePermissions('quotes.approve')
  @Post(':id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.svc.approve(id, user);
  }

  @RequirePermissions('quotes.reject')
  @Post(':id/reject')
  reject(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.svc.reject(id, user);
  }

  @RequirePermissions('quotes.update')
  @Post(':id/send')
  send(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.svc.send(id, user);
  }

  @RequirePermissions('quotes.read')
  @Post(':id/generate-pdf')
  generatePdf(@Param('id') id: string) {
    // PDF generation will be a Phase 2 task (puppeteer / pdfkit). Returns 501 for now.
    return { status: 'not_implemented', message: 'PDF teklif üretimi sonraki fazda eklenecek', quoteId: id };
  }
}
