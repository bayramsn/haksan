import { CommercialPdfService } from './commercial-pdf.service';
import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  quoteCreateSchema,
  quoteDraftCreateSchema,
  type QuoteDraftCreateInput,
  quoteDraftUpdateSchema,
  type QuoteDraftUpdateInput,
  quoteUpdateSchema,
  quoteItemCreateSchema,
  quoteItemUpdateSchema,
  quoteStatusChangeSchema,
  quoteTermsUpsertSchema,
  standaloneQuoteCreateSchema,
  paginationSchema,
  type StandaloneQuoteCreateInput,
  type QuoteCreateInput,
  type QuoteUpdateInput,
  type QuoteItemCreateInput,
  type QuoteItemUpdateInput,
  type QuoteStatusChangeInput,
  type QuoteTermsUpsertInput,
  type Pagination,
} from '@haksan/shared';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { AuthGuard } from '../../shared/security/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../shared/security/permissions.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { QuotesService } from './quotes.service';

const listQuery = z.object({
  search: z.string().optional(),
  statusCode: z.string().optional(),
  companyId: z.string().optional(),
  // Fırsata bağlı teklifler: mobil, kartın tekliflerini istemcide süzemiyor.
  opportunityId: z.string().uuid().optional(),
  businessLine: z.enum(['CNC', 'UNI', 'SACISLE']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
const priceApprovalSchema = z.object({ note: z.string().max(1000).optional() });

@UseGuards(AuthGuard, PermissionsGuard)
@Controller('quotes')
export class QuotesController {
  constructor(private readonly svc: QuotesService, private readonly commercialPdfs: CommercialPdfService) {}

  @RequirePermissions('quotes.read')
  @Get()
  async list(
    @Query(new ZodValidationPipe(listQuery.merge(paginationSchema)))
    qp: z.infer<typeof listQuery> & Pagination,
    @CurrentUser() user: AuthContext
  ) {
    const { page, pageSize, sortBy, sortDir, ...query } = qp;
    const result = await this.svc.list(user, query, { page, pageSize, sortBy, sortDir });
    return { ...result, data: await this.commercialPdfs.decorate('quote', result.data, user) };
  }

  @RequirePermissions('quotes.read')
  @Get('summary')
  summary(
    @Query(new ZodValidationPipe(listQuery)) query: z.infer<typeof listQuery>,
    @CurrentUser() user: AuthContext,
  ) {
    return this.svc.summary(user, query);
  }

  @RequirePermissions('quotes.read')
  @Get(':id')
  async get(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    const record = await this.svc.get(id, user);
    return (await this.commercialPdfs.decorate('quote', [record], user))[0];
  }

  @RequirePermissions('quotes.create')
  @Post()
  create(@Body(new ZodValidationPipe(quoteCreateSchema)) body: QuoteCreateInput, @CurrentUser() user: AuthContext) {
    return this.svc.create(body, user);
  }

  /** Fırsat açmadan ("hızlı") teklif — başlık, kalemler ve şartlar tek istekte gelir. */
  @RequirePermissions('quotes.create')
  @Post('standalone')
  createStandalone(
    @Body(new ZodValidationPipe(standaloneQuoteCreateSchema)) body: StandaloneQuoteCreateInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.createStandaloneQuote(body, user);
  }

  @RequirePermissions('quotes.create')
  @Post('draft')
  createDraft(@Body(new ZodValidationPipe(quoteDraftCreateSchema)) body: QuoteDraftCreateInput,
    @CurrentUser() user: AuthContext) {
    return this.svc.createDraft(body, user);
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

  @RequirePermissions('quotes.update')
  @Patch(':id/draft')
  updateDraft(@Param('id') id: string,
    @Body(new ZodValidationPipe(quoteDraftUpdateSchema)) body: QuoteDraftUpdateInput,
    @CurrentUser() user: AuthContext) {
    return this.svc.updateDraft(id, body, user);
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

  @RequirePermissions('quotes.approve')
  @Post(':id/revoke-approval')
  revokeApproval(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.svc.revokeApproval(id, user);
  }

  @RequirePermissions('quotes.approve')
  @Post(':id/price-approval/approve')
  approvePrice(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(priceApprovalSchema)) body: z.infer<typeof priceApprovalSchema>,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.approvePrice(id, user, body.note);
  }

  @RequirePermissions('quotes.reject')
  @Post(':id/price-approval/reject')
  rejectPrice(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(priceApprovalSchema)) body: z.infer<typeof priceApprovalSchema>,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.rejectPrice(id, user, body.note);
  }

  @RequirePermissions('quotes.reject')
  @Post(':id/reject')
  reject(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.svc.reject(id, user);
  }

  @RequirePermissions('quotes.update')
  @Post(':id/status')
  changeStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(quoteStatusChangeSchema)) body: QuoteStatusChangeInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.changeStatus(id, body, user);
  }

  @RequirePermissions('quotes.update')
  @Post(':id/send')
  send(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.svc.send(id, user);
  }

  @RequirePermissions('quotes.read')
  @Post(':id/generate-pdf')
  async generatePdf(@Param('id') id: string, @CurrentUser() user: AuthContext, @Res() res: FastifyReply) {
    const { buffer, filename } = await this.commercialPdfs.read('quote', id, user);
    res
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .header('Cache-Control', 'private, no-store')
      .send(buffer);
  }
}
