import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import {
  commercialInvoiceCreateSchema,
  commercialInvoiceUpdateSchema,
  contractCreateSchema,
  contractUpdateSchema,
  paginationSchema,
  proformaCreateSchema,
  proformaUpdateSchema,
  standaloneContractCreateSchema,
  standaloneContractUpdateSchema,
  standaloneProformaCreateSchema,
  standaloneProformaUpdateSchema,
  type CommercialInvoiceCreateInput,
  type CommercialInvoiceUpdateInput,
  type ContractCreateInput,
  type ContractUpdateInput,
  type ProformaCreateInput,
  type ProformaUpdateInput,
  type StandaloneContractCreateInput,
  type StandaloneContractUpdateInput,
  type StandaloneProformaCreateInput,
  type StandaloneProformaUpdateInput,
} from '@haksan/shared';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { AuthGuard } from '../../shared/security/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../shared/security/permissions.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { QuotesService } from './quotes.service';

const commercialDocumentListQuery = paginationSchema.extend({
  search: z.string().trim().max(128).optional(),
  companyId: z.string().optional(),
  quoteId: z.string().optional(),
});
type CommercialDocumentListQuery = z.infer<typeof commercialDocumentListQuery>;

@UseGuards(AuthGuard, PermissionsGuard)
@Controller()
export class CommercialDocumentsController {
  constructor(private readonly svc: QuotesService) {}

  @RequirePermissions('proformas.read')
  @Get('proformas')
  listProformas(@Query(new ZodValidationPipe(commercialDocumentListQuery)) qp: CommercialDocumentListQuery, @CurrentUser() user: AuthContext) {
    return this.svc.listProformas(user, qp);
  }

  @RequirePermissions('proformas.read')
  @Get('proformas/:id')
  getProforma(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.svc.getProforma(id, user);
  }

  @RequirePermissions('proformas.create')
  @Post('proformas')
  createProforma(@Body(new ZodValidationPipe(proformaCreateSchema)) body: ProformaCreateInput, @CurrentUser() user: AuthContext) {
    return this.svc.createProforma(body, user);
  }

  /** Tekliften bağımsız ("hızlı") proforma — kalemler doğrudan belgeye yazılır. */
  @RequirePermissions('proformas.create')
  @Post('proformas/standalone')
  createStandaloneProforma(
    @Body(new ZodValidationPipe(standaloneProformaCreateSchema)) body: StandaloneProformaCreateInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.createStandaloneProforma(body, user);
  }

  @RequirePermissions('proformas.update')
  @Patch('proformas/standalone/:id')
  updateStandaloneProforma(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(standaloneProformaUpdateSchema)) body: StandaloneProformaUpdateInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.updateStandaloneProforma(id, body, user);
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

  @RequirePermissions('proformas.delete')
  @Delete('proformas/:id')
  deleteProforma(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.svc.deleteProforma(id, user);
  }

  @RequirePermissions('contracts.read')
  @Get('contracts')
  listContracts(@Query(new ZodValidationPipe(commercialDocumentListQuery)) qp: CommercialDocumentListQuery, @CurrentUser() user: AuthContext) {
    return this.svc.listContracts(user, qp);
  }

  @RequirePermissions('contracts.read')
  @Get('contracts/:id')
  getContract(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.svc.getContract(id, user);
  }

  @RequirePermissions('contracts.create')
  @Post('contracts')
  createContract(@Body(new ZodValidationPipe(contractCreateSchema)) body: ContractCreateInput, @CurrentUser() user: AuthContext) {
    return this.svc.createContract(body, user);
  }

  /** Tekliften bağımsız ("hızlı") sözleşme — kalemler ve şartlar doğrudan belgeye yazılır. */
  @RequirePermissions('contracts.create')
  @Post('contracts/standalone')
  createStandaloneContract(
    @Body(new ZodValidationPipe(standaloneContractCreateSchema)) body: StandaloneContractCreateInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.createStandaloneContract(body, user);
  }

  // `contracts/:id` deseninden ÖNCE tanımlı olmalı, aksi halde "standalone" id sanılır.
  @RequirePermissions('contracts.update')
  @Patch('contracts/standalone/:id')
  updateStandaloneContract(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(standaloneContractUpdateSchema)) body: StandaloneContractUpdateInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.updateStandaloneContract(id, body, user);
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

  @RequirePermissions('contracts.delete')
  @Delete('contracts/:id')
  deleteContract(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.svc.deleteContract(id, user);
  }

  @RequirePermissions('commercial_invoices.read')
  @Get('commercial-invoices')
  listCommercialInvoices(@Query(new ZodValidationPipe(commercialDocumentListQuery)) qp: CommercialDocumentListQuery, @CurrentUser() user: AuthContext) {
    return this.svc.listCommercialInvoices(user, qp);
  }

  @RequirePermissions('commercial_invoices.read')
  @Get('commercial-invoices/:id')
  getCommercialInvoice(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.svc.getCommercialInvoice(id, user);
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

  @RequirePermissions('commercial_invoices.delete')
  @Delete('commercial-invoices/:id')
  deleteCommercialInvoice(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.svc.deleteCommercialInvoice(id, user);
  }
}
