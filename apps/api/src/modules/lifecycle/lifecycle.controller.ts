import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { AuthGuard } from '../../shared/security/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../shared/security/permissions.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { LifecycleService } from './lifecycle.service';

const passportPublishSchema = z.object({
  publicTitle: z.string().max(255).optional(),
  publicNotes: z.string().max(4000).optional(),
});

const cpqPreviewSchema = z.object({
  companyId: z.string().optional(),
  productModelId: z.string().min(1),
  inventoryItemId: z.string().optional(),
  selectedOptionValueIds: z.array(z.string()).default([]),
  includeInstallation: z.coerce.boolean().default(false),
  includeLogistics: z.coerce.boolean().default(false),
  currencyCode: z.string().max(8).optional(),
});

const cpqCreateQuoteSchema = cpqPreviewSchema.extend({
  companyId: z.string().min(1),
  contactId: z.string().optional(),
  validityDays: z.coerce.number().int().min(1).max(365).optional(),
  paymentTerms: z.string().max(2000).optional(),
  deliveryTerms: z.string().max(2000).optional(),
  warrantyTerms: z.string().max(2000).optional(),
  notes: z.string().max(4000).optional(),
});

const publicTicketSchema = z.object({
  subject: z.string().min(3).max(255),
  description: z.string().max(4000).optional(),
  severity: z.enum(['low', 'normal', 'high', 'critical']).default('normal'),
});

@UseGuards(AuthGuard, PermissionsGuard)
@Controller('lifecycle')
export class LifecycleController {
  constructor(private readonly lifecycle: LifecycleService) {}

  @RequirePermissions('customer_devices.read')
  @Get('passports')
  listPassports(@CurrentUser() user: AuthContext) {
    return this.lifecycle.listPassports(user);
  }

  @RequirePermissions('customer_devices.update')
  @Post('passports/:deviceId/publish')
  publishPassport(
    @Param('deviceId') deviceId: string,
    @Body(new ZodValidationPipe(passportPublishSchema)) body: z.infer<typeof passportPublishSchema>,
    @CurrentUser() user: AuthContext
  ) {
    return this.lifecycle.publishPassport(deviceId, body, user);
  }

  @RequirePermissions('customer_devices.update')
  @Post('passports/:passportId/rotate-token')
  rotatePassport(@Param('passportId') passportId: string, @CurrentUser() user: AuthContext) {
    return this.lifecycle.rotatePassport(passportId, user);
  }

  @RequirePermissions('customer_devices.update')
  @Patch('passports/:passportId/revoke')
  revokePassport(@Param('passportId') passportId: string, @CurrentUser() user: AuthContext) {
    return this.lifecycle.revokePassport(passportId, user);
  }

  @RequirePermissions('quotes.create')
  @Post('cpq/preview')
  cpqPreview(@Body(new ZodValidationPipe(cpqPreviewSchema)) body: z.infer<typeof cpqPreviewSchema>, @CurrentUser() user: AuthContext) {
    return this.lifecycle.cpqPreview(body, user);
  }

  @RequirePermissions('quotes.create')
  @Post('cpq/create-quote')
  createQuoteFromCpq(
    @Body(new ZodValidationPipe(cpqCreateQuoteSchema)) body: z.infer<typeof cpqCreateQuoteSchema>,
    @CurrentUser() user: AuthContext
  ) {
    return this.lifecycle.createQuoteFromCpq(body, user);
  }

  @RequirePermissions('service_tickets.read')
  @Get('service-radar')
  serviceRadar(@CurrentUser() user: AuthContext) {
    return this.lifecycle.serviceRadar(user);
  }
}

@Controller('public/passports')
export class PublicPassportController {
  constructor(private readonly lifecycle: LifecycleService) {}

  @Get(':slug/:token')
  getPassport(@Param('slug') slug: string, @Param('token') token: string) {
    return this.lifecycle.getPublicPassport(slug, token);
  }

  @Post(':slug/:token/service-tickets')
  createServiceTicket(
    @Param('slug') slug: string,
    @Param('token') token: string,
    @Body(new ZodValidationPipe(publicTicketSchema)) body: z.infer<typeof publicTicketSchema>
  ) {
    return this.lifecycle.createPublicServiceTicket(slug, token, body);
  }
}
