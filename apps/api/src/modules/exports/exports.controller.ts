import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { companyListQuerySchema } from '@haksan/shared';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { AuthGuard } from '../../shared/security/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../shared/security/permissions.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { rowsToXlsxBuffer, sendXlsx, sheetsToXlsxBuffer } from '../../shared/utils/excel-export';
import { ExportsService } from './exports.service';

const oppQuery = z.object({
  search: z.string().optional(),
  stageCode: z.string().optional(),
  companyId: z.string().uuid().optional(),
});
const quoteQuery = z.object({
  search: z.string().optional(),
  statusCode: z.string().optional(),
  companyId: z.string().uuid().optional(),
});
const contactQuery = z.object({
  search: z.string().optional(),
  companyId: z.string().uuid().optional(),
});
const inventoryQuery = z.object({
  search: z.string().optional(),
  statusCode: z.string().optional(),
});
const poQuery = z.object({
  search: z.string().optional(),
  supplierCompanyId: z.string().uuid().optional(),
  statusCode: z.string().optional(),
});
const operationalQuery = z.object({
  year: z.coerce.number().int().min(2000).max(2100).default(new Date().getFullYear()),
  period: z.enum(['monthly', 'yearly']).default('monthly'),
});

@UseGuards(AuthGuard, PermissionsGuard)
@Controller('exports')
export class ExportsController {
  constructor(private readonly svc: ExportsService) {}

  @RequirePermissions('reports.export')
  @Get('companies')
  async companies(
    @Query(new ZodValidationPipe(companyListQuerySchema.pick({ search: true, relationTypeCode: true, customerStatusCode: true })))
    q: z.infer<typeof companyListQuerySchema>,
    @CurrentUser() user: AuthContext,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const rows = await this.svc.exportCompanies(user, q);
    return sendXlsx(reply, await rowsToXlsxBuffer(rows, 'Firmalar'), 'firmalar.xlsx');
  }

  @RequirePermissions('reports.export')
  @Get('contacts')
  async contacts(
    @Query(new ZodValidationPipe(contactQuery)) q: z.infer<typeof contactQuery>,
    @CurrentUser() user: AuthContext,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const rows = await this.svc.exportContacts(user, q);
    return sendXlsx(reply, await rowsToXlsxBuffer(rows, 'Kontaklar'), 'kontaklar.xlsx');
  }

  @RequirePermissions('reports.export')
  @Get('opportunities')
  async opportunities(
    @Query(new ZodValidationPipe(oppQuery)) q: z.infer<typeof oppQuery>,
    @CurrentUser() user: AuthContext,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const rows = await this.svc.exportOpportunities(user, q);
    return sendXlsx(reply, await rowsToXlsxBuffer(rows, 'Satış Kartları'), 'satis-kartlari.xlsx');
  }

  @RequirePermissions('reports.export')
  @Get('quotes')
  async quotes(
    @Query(new ZodValidationPipe(quoteQuery)) q: z.infer<typeof quoteQuery>,
    @CurrentUser() user: AuthContext,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const rows = await this.svc.exportQuotes(user, q);
    return sendXlsx(reply, await rowsToXlsxBuffer(rows, 'Teklifler'), 'teklifler.xlsx');
  }

  @RequirePermissions('reports.export')
  @Get('finance')
  async finance(@CurrentUser() user: AuthContext, @Res({ passthrough: true }) reply: FastifyReply) {
    const sheets = await this.svc.exportFinance(user);
    return sendXlsx(reply, await sheetsToXlsxBuffer(sheets), 'kasa-hareketleri.xlsx');
  }

  @RequirePermissions('reports.export')
  @Get('customer-statement/:companyId')
  async customerStatement(
    @Param('companyId') companyId: string,
    @Query(new ZodValidationPipe(z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() }))) range: { from?: Date; to?: Date },
    @CurrentUser() user: AuthContext,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const rows = await this.svc.exportCustomerStatement(user, companyId, range);
    return sendXlsx(reply, await rowsToXlsxBuffer(rows, 'Cari Ekstre'), `cari-ekstre-${companyId}.xlsx`);
  }

  @RequirePermissions('reports.export')
  @Get('customer-balances')
  async customerBalances(@CurrentUser() user: AuthContext, @Res({ passthrough: true }) reply: FastifyReply) {
    const rows = await this.svc.exportCustomerBalances(user);
    return sendXlsx(reply, await rowsToXlsxBuffer(rows, 'Cari Rapor'), 'cari-rapor.xlsx');
  }

  @RequirePermissions('reports.export')
  @Get('service-tickets')
  async serviceTickets(@CurrentUser() user: AuthContext, @Res({ passthrough: true }) reply: FastifyReply) {
    const rows = await this.svc.exportServiceTickets(user);
    return sendXlsx(reply, await rowsToXlsxBuffer(rows, 'Servis'), 'servis-talepleri.xlsx');
  }

  @RequirePermissions('reports.export')
  @Get('inventory')
  async inventory(
    @Query(new ZodValidationPipe(inventoryQuery)) q: z.infer<typeof inventoryQuery>,
    @CurrentUser() user: AuthContext,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const rows = await this.svc.exportInventory(user, q);
    return sendXlsx(reply, await rowsToXlsxBuffer(rows, 'Stok'), 'stok.xlsx');
  }

  @RequirePermissions('reports.export')
  @Get('shipments')
  async shipments(@CurrentUser() user: AuthContext, @Res({ passthrough: true }) reply: FastifyReply) {
    const rows = await this.svc.exportShipments(user);
    return sendXlsx(reply, await rowsToXlsxBuffer(rows, 'Sevkiyatlar'), 'sevkiyatlar.xlsx');
  }

  @RequirePermissions('reports.export')
  @Get('deliveries')
  async deliveries(@CurrentUser() user: AuthContext, @Res({ passthrough: true }) reply: FastifyReply) {
    const rows = await this.svc.exportDeliveries(user);
    return sendXlsx(reply, await rowsToXlsxBuffer(rows, 'Teslimatlar'), 'teslimatlar.xlsx');
  }

  @RequirePermissions('reports.export')
  @Get('purchase-orders')
  async purchaseOrders(
    @Query(new ZodValidationPipe(poQuery)) q: z.infer<typeof poQuery>,
    @CurrentUser() user: AuthContext,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const rows = await this.svc.exportPurchaseOrders(user, q);
    return sendXlsx(reply, await rowsToXlsxBuffer(rows, 'Satın Alma'), 'satinalma-siparisleri.xlsx');
  }

  @RequirePermissions('reports.export')
  @Get('documents')
  async documents(@CurrentUser() user: AuthContext, @Res({ passthrough: true }) reply: FastifyReply) {
    const rows = await this.svc.exportDocuments(user);
    return sendXlsx(reply, await rowsToXlsxBuffer(rows, 'Dokümanlar'), 'dokumanlar.xlsx');
  }

  @RequirePermissions('reports.export')
  @Get('operational')
  async operational(
    @Query(new ZodValidationPipe(operationalQuery)) q: z.infer<typeof operationalQuery>,
    @CurrentUser() user: AuthContext,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const rows = await this.svc.exportOperational(user, q.year, q.period);
    const name = q.period === 'monthly' ? `rapor-${q.year}.xlsx` : 'rapor-yillik.xlsx';
    return sendXlsx(reply, await rowsToXlsxBuffer(rows, 'Operasyonel'), name);
  }
}
