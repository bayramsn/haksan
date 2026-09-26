import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import {
  tradeFairContactCreateSchema,
  tradeFairContactUpdateSchema,
  tradeFairListQuerySchema,
  tradeFairToCompanySchema,
  type TradeFairContactInput,
  type TradeFairContactUpdateInput,
  type TradeFairListQuery,
  type TradeFairToCompanyInput,
} from '@haksan/shared';
import { AuthGuard } from '../../shared/security/auth.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { PermissionsGuard, RequirePermissions } from '../../shared/security/permissions.guard';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { TradeFairsService } from './trade-fairs.service';

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

  @RequirePermissions('trade_fairs.read')
  @Get('summary')
  summary(
    @Query(new ZodValidationPipe(summaryQuerySchema)) query: z.infer<typeof summaryQuerySchema>,
    @CurrentUser() actor: AuthContext
  ) {
    return this.service.summary(actor, query.fairName);
  }

  @RequirePermissions('trade_fairs.read')
  @Get('staff')
  staff(@CurrentUser() actor: AuthContext) {
    return this.service.staff(actor);
  }

  @RequirePermissions('trade_fairs.read')
  @Get('departments')
  departments(@CurrentUser() actor: AuthContext) {
    return this.service.departments(actor);
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
