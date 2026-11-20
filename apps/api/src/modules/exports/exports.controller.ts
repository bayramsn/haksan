import { Body, Controller, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { FastifyReply } from 'fastify';
import {
  tradeFairListQuerySchema,
  type TradeFairListQuery,
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
import { TradeFairsService } from '../trade-fairs/trade-fairs.service';
import { ExportsService } from './exports.service';

export const selectedOpportunityExportSchema = z.object({ ids: z.array(z.string().uuid()).max(10_000) });

@UseGuards(AuthGuard, PermissionsGuard)
@Controller('exports')
export class ExportsController {
  constructor(private readonly svc: ExportsService, private readonly tradeFairs: TradeFairsService) {}

  @RequirePermissions('reports.export', 'companies.read')
  @Get('companies')
  async companies(
    @Query(new ZodValidationPipe(companyListQuerySchema))
    q: CompanyListQuery,
    @CurrentUser() user: AuthContext,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const rows = await this.svc.exportCompanies(user, q);
    return sendXlsx(reply, await rowsToXlsxBuffer(rows, 'Firmalar'), 'firmalar.xlsx');
  }

  @RequirePermissions('reports.export', 'contacts.read')
  @Get('contacts')
  async contacts(
    @Query(new ZodValidationPipe(exportContactQuerySchema)) q: ExportContactQuery,
    @CurrentUser() user: AuthContext,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const rows = await this.svc.exportContacts(user, q);
    return sendXlsx(reply, await rowsToXlsxBuffer(rows, 'Kontaklar'), 'kontaklar.xlsx');
  }

  @RequirePermissions('reports.export', 'opportunities.read')
  @Get('opportunities')
  async opportunities(
    @Query(new ZodValidationPipe(exportOpportunityQuerySchema)) q: ExportOpportunityQuery,
    @CurrentUser() user: AuthContext,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const rows = await this.svc.exportOpportunities(user, q);
    return sendXlsx(reply, await rowsToXlsxBuffer(rows, 'Fırsatlar'), 'firsatlar.xlsx');
  }

  @RequirePermissions('reports.export', 'opportunities.read')
  @Post('opportunities/selected')
  async selectedOpportunities(
    @Body(new ZodValidationPipe(selectedOpportunityExportSchema)) body: z.infer<typeof selectedOpportunityExportSchema>,
    @CurrentUser() user: AuthContext,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const rows = await this.svc.exportOpportunities(user, { ids: body.ids });
    const columns = ['No', 'Müşteri', 'Kontak', 'İrtibat Bilgisi', 'Başlık', 'Tutar', 'Para Birimi', 'Derece', 'Operasyon Aşaması', 'Atanan', 'Açılış'];
    return sendXlsx(reply, await sheetsToXlsxBuffer([{ name: 'Fırsatlar', rows, columns }]), 'firsatlar.xlsx');
  }

  @RequirePermissions('reports.export', 'trade_fairs.read')
  @Get('trade-fairs')
  async tradeFairContacts(
    @Query(new ZodValidationPipe(tradeFairListQuerySchema)) q: TradeFairListQuery,
    @CurrentUser() user: AuthContext,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const rows = await this.tradeFairs.exportRows(user, q);
    const columns = ['Fuar', 'Firma', 'Yetkili', 'Unvan', 'Telefon', 'E-posta', 'Ülke', 'Şehir', 'İlçe', 'Ürün Kategorisi', 'Ürün', 'Görüşen', 'Kişi Sayısı', 'İletişime Geçildi', 'Görüşme Tarihi', 'Görüşme Notu', 'Teklif Gönderildi', 'Müşteriye Dönüştü', 'Notlar', 'Kayıt Tarihi'];
    return sendXlsx(reply, await sheetsToXlsxBuffer([{ name: 'Fuar', rows, columns }]), 'fuar.xlsx');
  }

  @RequirePermissions('reports.export', 'quotes.read')
  @Get('quotes')
  async quotes(
    @Query(new ZodValidationPipe(exportQuoteQuerySchema)) q: ExportQuoteQuery,
    @CurrentUser() user: AuthContext,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const rows = await this.svc.exportQuotes(user, q);
    return sendXlsx(reply, await rowsToXlsxBuffer(rows, 'Teklifler'), 'teklifler.xlsx');
  }

  @RequirePermissions('reports.export', 'receivables.read', 'payments.read')
  @Get('finance')
  async finance(@CurrentUser() user: AuthContext, @Res({ passthrough: true }) reply: FastifyReply) {
    const sheets = await this.svc.exportFinance(user);
    return sendXlsx(reply, await sheetsToXlsxBuffer(sheets), 'kasa-hareketleri.xlsx');
  }

  @RequirePermissions('reports.export', 'receivables.read')
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
      const companyLabel = await this.svc.customerStatementCompanyLabel(user, companyId);
      const dateLabel = [range.from?.toLocaleDateString('tr-TR'), range.to?.toLocaleDateString('tr-TR')]
        .filter(Boolean)
        .join(' – ');
      const buffer = await rowsToPdfBuffer({
        title: 'Cari Ekstre',
        subtitle: [companyLabel, dateLabel ? `Dönem: ${dateLabel}` : 'Tüm hareketler'].join(' · '),
        rows,
      });
      return sendPdf(reply, buffer, `${baseName}.pdf`);
    }
    return sendXlsx(reply, await rowsToXlsxBuffer(rows, 'Cari Ekstre'), `${baseName}.xlsx`);
  }

  @RequirePermissions('reports.export', 'receivables.read')
  @Get('customer-balances')
  async customerBalances(@CurrentUser() user: AuthContext, @Res({ passthrough: true }) reply: FastifyReply) {
    const rows = await this.svc.exportCustomerBalances(user);
    return sendXlsx(reply, await rowsToXlsxBuffer(rows, 'Cari Rapor'), 'cari-rapor.xlsx');
  }

  @RequirePermissions('reports.export', 'service_tickets.read')
  @Get('service-tickets')
  async serviceTickets(@CurrentUser() user: AuthContext, @Res({ passthrough: true }) reply: FastifyReply) {
    const rows = await this.svc.exportServiceTickets(user);
    return sendXlsx(reply, await rowsToXlsxBuffer(rows, 'Servis'), 'servis-talepleri.xlsx');
  }

  @RequirePermissions('reports.export', 'service_tickets.read')
  @Get('service-complaints')
  async serviceComplaints(@CurrentUser() user: AuthContext, @Res({ passthrough: true }) reply: FastifyReply) {
    const rows = await this.svc.exportServiceComplaints(user);
    return sendXlsx(reply, await rowsToXlsxBuffer(rows, 'Şikayet Kutusu'), 'sikayet-kutusu.xlsx');
  }

  @RequirePermissions('reports.export', 'inventory.read')
  @Get('inventory')
  async inventory(
    @Query(new ZodValidationPipe(exportInventoryQuerySchema)) q: ExportInventoryQuery,
    @CurrentUser() user: AuthContext,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const rows = await this.svc.exportInventory(user, q);
    return sendXlsx(reply, await rowsToXlsxBuffer(rows, 'Stok'), 'stok.xlsx');
  }

  @RequirePermissions('reports.export', 'shipments.read')
  @Get('shipments')
  async shipments(@CurrentUser() user: AuthContext, @Res({ passthrough: true }) reply: FastifyReply) {
    const rows = await this.svc.exportShipments(user);
    return sendXlsx(reply, await rowsToXlsxBuffer(rows, 'Sevkiyatlar'), 'sevkiyatlar.xlsx');
  }

  @RequirePermissions('reports.export', 'shipments.read')
  @Get('deliveries')
  async deliveries(@CurrentUser() user: AuthContext, @Res({ passthrough: true }) reply: FastifyReply) {
    const rows = await this.svc.exportDeliveries(user);
    return sendXlsx(reply, await rowsToXlsxBuffer(rows, 'Teslimatlar'), 'teslimatlar.xlsx');
  }

  @RequirePermissions('reports.export', 'purchase_orders.read')
  @Get('purchase-orders')
  async purchaseOrders(
    @Query(new ZodValidationPipe(exportPurchaseOrderQuerySchema)) q: ExportPurchaseOrderQuery,
    @CurrentUser() user: AuthContext,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const rows = await this.svc.exportPurchaseOrders(user, q);
    return sendXlsx(reply, await rowsToXlsxBuffer(rows, 'Satın Alma'), 'satinalma-siparisleri.xlsx');
  }

  @RequirePermissions('reports.export', 'files.read')
  @Get('documents')
  async documents(@CurrentUser() user: AuthContext, @Res({ passthrough: true }) reply: FastifyReply) {
    const rows = await this.svc.exportDocuments(user);
    return sendXlsx(reply, await rowsToXlsxBuffer(rows, 'Dokümanlar'), 'dokumanlar.xlsx');
  }

  @RequirePermissions('reports.export', 'reports.read')
  @Get('operational')
  async operational(
    @Query(new ZodValidationPipe(exportOperationalQuerySchema)) q: ExportOperationalQuery,
    @CurrentUser() user: AuthContext,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const rows = await this.svc.exportOperational(user, q);
    const name = q.period === 'monthly' ? `rapor-${q.year}.xlsx` : 'rapor-yillik.xlsx';
    return sendXlsx(reply, await rowsToXlsxBuffer(rows, 'Operasyonel'), name);
  }
}
