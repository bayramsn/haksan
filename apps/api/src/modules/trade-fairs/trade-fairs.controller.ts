import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  exportFormatQuerySchema,
  type ExportFormatQuery,
  tradeFairCalledSchema,
  type TradeFairCalledInput,
  tradeFairContactCreateSchema,
  tradeFairContactUpdateSchema,
  tradeFairListQuerySchema,
  tradeFairPhotosQuerySchema,
  tradeFairProductQuerySchema,
  tradeFairToCompanySchema,
  type TradeFairContactInput,
  type TradeFairContactUpdateInput,
  type TradeFairListQuery,
  type TradeFairPhotosQuery,
  type TradeFairProductQuery,
  type TradeFairToCompanyInput,
} from '@haksan/shared';
import { AuthGuard } from '../../shared/security/auth.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { PermissionsGuard, RequirePermissions } from '../../shared/security/permissions.guard';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { rowsToXlsxBuffer, sendXlsx } from '../../shared/utils/excel-export';
import { filterSubtitle, pickColumns, rowsToPdfBuffer, sendPdf } from '../../shared/utils/pdf-export';
import { TradeFairsService } from './trade-fairs.service';

const TRADE_FAIR_PDF_COLUMNS = ['Tarih', 'Fuar', 'Firma', 'Yetkili', 'Telefon', 'E-posta', 'İl', 'İlçe', 'Ürünler', 'Görüşen Kişi'] as const;

const summaryQuerySchema = z.object({ fairName: z.string().trim().max(200).optional() });

@UseGuards(AuthGuard, PermissionsGuard)
@Controller('trade-fairs')
export class TradeFairsController {
  constructor(private readonly service: TradeFairsService) {}

  @RequirePermissions('trade_fairs.read')
  @Get()
  list(
    @Query(new ZodValidationPipe<any>(tradeFairListQuerySchema)) query: TradeFairListQuery,
    @CurrentUser() actor: AuthContext
  ) {
    return this.service.list(actor, query);
  }

  /** Listedeki süzgeçlerle (fuar, arama, il, ilçe) Excel ya da `format=pdf` ile PDF; sayfalama yok sayılır. */
  @RequirePermissions('trade_fairs.read', 'reports.export')
  @Get('export')
  async export(
    @Query(new ZodValidationPipe<any>(tradeFairListQuerySchema)) query: TradeFairListQuery,
    @CurrentUser() actor: AuthContext,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Query(new ZodValidationPipe(exportFormatQuerySchema)) { format }: ExportFormatQuery
  ) {
    const rows = await this.service.exportRows(actor, query);
    if (format === 'pdf') {
      const buffer = await rowsToPdfBuffer({
        title: 'Fuar Görüşmeleri',
        // Görüşen süzgeçliyse bütün satırlar aynı kişidir; adı ilk satırdan okunur.
        subtitle: filterSubtitle([
          ['Fuar', query.fairName],
          ['Görüşen', query.metByUserId ? String(rows[0]?.['Görüşen Kişi'] ?? '') : undefined],
          ['İl', query.province],
          ['İlçe', query.district],
          ['Arama', query.q],
        ], rows.length),
        rows: pickColumns(rows, TRADE_FAIR_PDF_COLUMNS),
      });
      return sendPdf(reply, buffer, 'fuar-gorusmeleri.pdf');
    }
    return sendXlsx(reply, await rowsToXlsxBuffer(rows, 'Fuar Görüşmeleri'), 'fuar-gorusmeleri.xlsx');
  }

  @RequirePermissions('trade_fairs.read')
  @Get('summary')
  summary(
    @Query(new ZodValidationPipe(summaryQuerySchema)) query: z.infer<typeof summaryQuerySchema>,
    @CurrentUser() actor: AuthContext
  ) {
    return this.service.summary(actor, query.fairName);
  }

  @RequirePermissions('trade_fairs.read', 'files.read')
  @Get('photos')
  photos(
    @Query(new ZodValidationPipe<any>(tradeFairPhotosQuerySchema)) query: TradeFairPhotosQuery,
    @CurrentUser() actor: AuthContext
  ) {
    return this.service.photos(actor, query);
  }

  @RequirePermissions('trade_fairs.read')
  @Get('staff')
  staff(@CurrentUser() actor: AuthContext) {
    return this.service.staff(actor);
  }

  @RequirePermissions('trade_fairs.read')
  @Get('divisions')
  divisions(@CurrentUser() actor: AuthContext) {
    return this.service.divisions(actor);
  }

  @RequirePermissions('trade_fairs.read')
  @Get('products')
  products(
    @Query(new ZodValidationPipe(tradeFairProductQuerySchema)) query: TradeFairProductQuery,
    @CurrentUser() actor: AuthContext
  ) {
    return this.service.products(actor, query);
  }

  @RequirePermissions('trade_fairs.create')
  @Post()
  create(
    @Body(new ZodValidationPipe(tradeFairContactCreateSchema)) body: TradeFairContactInput,
    @CurrentUser() actor: AuthContext
  ) {
    return this.service.create(actor, body);
  }

  @RequirePermissions('trade_fairs.update')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(tradeFairContactUpdateSchema)) body: TradeFairContactUpdateInput,
    @CurrentUser() actor: AuthContext
  ) {
    return this.service.update(actor, id, body);
  }

  /** Fuar kaydını Firmalar'a ekler (yeni firma ya da mevcut firmaya kontak). Firma/kontak yetkisi serviste. */
  @RequirePermissions('trade_fairs.update')
  @Patch(':id/called')
  setCalled(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(tradeFairCalledSchema)) body: TradeFairCalledInput,
    @CurrentUser() actor: AuthContext
  ) {
    return this.service.setCalled(actor, id, body.called);
  }

  @RequirePermissions('trade_fairs.update')
  @Post(':id/company')
  addToCompanies(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(tradeFairToCompanySchema)) body: TradeFairToCompanyInput,
    @CurrentUser() actor: AuthContext
  ) {
    return this.service.addToCompanies(actor, id, body);
  }

  @RequirePermissions('trade_fairs.delete')
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthContext) {
    return this.service.remove(actor, id);
  }
}
