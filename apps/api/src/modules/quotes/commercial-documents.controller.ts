import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  commercialInvoiceCreateSchema,
  commercialInvoiceUpdateSchema,
  contractCreateSchema,
  contractUpdateSchema,
  paginationSchema,
  proformaCreateSchema,
  proformaUpdateSchema,
  type CommercialInvoiceCreateInput,
  type CommercialInvoiceUpdateInput,
  type ContractCreateInput,
  type ContractUpdateInput,
  type Pagination,
  type ProformaCreateInput,
  type ProformaUpdateInput,
} from '@haksan/shared';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { AuthGuard } from '../../shared/security/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../shared/security/permissions.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { QuotesService } from './quotes.service';

@UseGuards(AuthGuard, PermissionsGuard)
@Controller()
export class CommercialDocumentsController {
  constructor(private readonly svc: QuotesService) {}

  @RequirePermissions('proformas.read')
  @Get('proformas')
  listProformas(@Query(new ZodValidationPipe(paginationSchema)) qp: Pagination, @CurrentUser() user: AuthContext) {
    return this.svc.listProformas(user, qp);
  }

  @RequirePermissions('proformas.create')
  @Post('proformas')
  createProforma(@Body(new ZodValidationPipe(proformaCreateSchema)) body: ProformaCreateInput, @CurrentUser() user: AuthContext) {
    return this.svc.createProforma(body, user);
  }

  @RequirePermissions('proformas.update')
  @Patch('proformas/:id')
  updateProforma(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(proformaUpdateSchema)) body: ProformaUpdateInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.updateProforma(id, body, user);
  }

  @RequirePermissions('contracts.read')
  @Get('contracts')
  listContracts(@Query(new ZodValidationPipe(paginationSchema)) qp: Pagination, @CurrentUser() user: AuthContext) {
    return this.svc.listContracts(user, qp);
  }

  @RequirePermissions('contracts.create')
  @Post('contracts')
  createContract(@Body(new ZodValidationPipe(contractCreateSchema)) body: ContractCreateInput, @CurrentUser() user: AuthContext) {
    return this.svc.createContract(body, user);
  }

  @RequirePermissions('contracts.update')
  @Patch('contracts/:id')
  updateContract(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(contractUpdateSchema)) body: ContractUpdateInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.updateContract(id, body, user);
  }

  @RequirePermissions('commercial_invoices.read')
  @Get('commercial-invoices')
  listCommercialInvoices(@Query(new ZodValidationPipe(paginationSchema)) qp: Pagination, @CurrentUser() user: AuthContext) {
    return this.svc.listCommercialInvoices(user, qp);
  }

  @RequirePermissions('commercial_invoices.create')
  @Post('commercial-invoices')
  createCommercialInvoice(
    @Body(new ZodValidationPipe(commercialInvoiceCreateSchema)) body: CommercialInvoiceCreateInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.createCommercialInvoice(body, user);
  }

  @RequirePermissions('commercial_invoices.update')
  @Patch('commercial-invoices/:id')
  updateCommercialInvoice(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(commercialInvoiceUpdateSchema)) body: CommercialInvoiceUpdateInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.updateCommercialInvoice(id, body, user);
  }
}
