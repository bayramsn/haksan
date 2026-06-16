import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import {
  companyListQuerySchema,
  exportOpportunityQuerySchema,
  exportQuoteQuerySchema,
  exportContactQuerySchema,
  exportInventoryQuerySchema,
  exportPurchaseOrderQuerySchema,
  exportOperationalQuerySchema,
  exportStatementQuerySchema,
  type CompanyListQuery,
  type ExportOpportunityQuery,
  type ExportQuoteQuery,
  type ExportContactQuery,
  type ExportInventoryQuery,
  type ExportPurchaseOrderQuery,
  type ExportOperationalQuery,
  type ExportStatementQuery,
} from '@haksan/shared';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { AuthGuard } from '../../shared/security/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../shared/security/permissions.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { rowsToXlsxBuffer, sendXlsx, sheetsToXlsxBuffer } from '../../shared/utils/excel-export';
import { rowsToPdfBuffer, sendPdf } from '../../shared/utils/pdf-export';
import { ExportsService } from './exports.service';

@UseGuards(AuthGuard, PermissionsGuard)
@Controller('exports')
export class ExportsController {
  constructor(private readonly svc: ExportsService) {}

  @RequirePermissions('reports.export')
  @Get('companies')
  async companies(
    @Query(new ZodValidationPipe(companyListQuerySchema.pick({ search: true, relationTypeCode: true, customerStatusCode: true })))
    q: CompanyListQuery,
    @CurrentUser() user: AuthContext,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const rows = await this.svc.exportCompanies(user, q);
    return sendXlsx(reply, await rowsToXlsxBuffer(rows, 'Firmalar'), 'firmalar.xlsx');
  }

  @RequirePermissions('reports.export')
  @Get('contacts')
  async contacts(
    @Query(new ZodValidationPipe(exportContactQuerySchema)) q: ExportContactQuery,
    @CurrentUser() user: AuthContext,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const rows = await this.svc.exportContacts(user, q);
    return sendXlsx(reply, await rowsToXlsxBuffer(rows, 'Kontaklar'), 'kontaklar.xlsx');
  }

  @RequirePermissions('reports.export')
  @Get('opportunities')
  async opportunities(
    @Query(new ZodValidationPipe(exportOpportunityQuerySchema)) q: ExportOpportunityQuery,
    @CurrentUser() user: AuthContext,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const rows = await this.svc.exportOpportunities(user, q);
    return sendXlsx(reply, await rowsToXlsxBuffer(rows, 'Satış Kartları'), 'satis-kartlari.xlsx');
  }

  @RequirePermissions('reports.export')
  @Get('quotes')
  async quotes(
    @Query(new ZodValidationPipe(exportQuoteQuerySchema)) q: ExportQuoteQuery,
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
    @Query(new ZodValidationPipe(exportStatementQuerySchema)) range: ExportStatementQuery,
    @CurrentUser() user: AuthContext,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const rows = await this.svc.exportCustomerStatement(user, companyId, range);
    const baseName = `cari-ekstre-${companyId}`;
    if (range.format === 'pdf') {
      const buffer = await rowsToPdfBuffer({ title: 'Cari Ekstre', rows });
      return sendPdf(reply, buffer, `${baseName}.pdf`);
    }
    return sendXlsx(reply, await rowsToXlsxBuffer(rows, 'Cari Ekstre'), `${baseName}.xlsx`);
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
    @Query(new ZodValidationPipe(exportInventoryQuerySchema)) q: ExportInventoryQuery,
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
    @Query(new ZodValidationPipe(exportPurchaseOrderQuerySchema)) q: ExportPurchaseOrderQuery,
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
    @Query(new ZodValidationPipe(exportOperationalQuerySchema)) q: ExportOperationalQuery,
    @CurrentUser() user: AuthContext,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const rows = await this.svc.exportOperational(user, q.year, q.period);
    const name = q.period === 'monthly' ? `rapor-${q.year}.xlsx` : 'rapor-yillik.xlsx';
    return sendXlsx(reply, await rowsToXlsxBuffer(rows, 'Operasyonel'), name);
  }
}
