import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  passportPublishSchema,
  cpqPreviewSchema,
  cpqCreateQuoteSchema,
  publicTicketSchema,
  type PassportPublishInput,
  type CpqPreviewInput,
  type CpqCreateQuoteInput,
  type PublicTicketInput,
} from '@haksan/shared';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { AuthGuard } from '../../shared/security/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../shared/security/permissions.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { LifecycleService } from './lifecycle.service';

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
    @Body(new ZodValidationPipe(passportPublishSchema)) body: PassportPublishInput,
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
  cpqPreview(@Body(new ZodValidationPipe(cpqPreviewSchema)) body: CpqPreviewInput, @CurrentUser() user: AuthContext) {
    return this.lifecycle.cpqPreview(body, user);
  }

  @RequirePermissions('quotes.create')
  @Post('cpq/create-quote')
  createQuoteFromCpq(
    @Body(new ZodValidationPipe(cpqCreateQuoteSchema)) body: CpqCreateQuoteInput,
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
    @Body(new ZodValidationPipe(publicTicketSchema)) body: PublicTicketInput
  ) {
    return this.lifecycle.createPublicServiceTicket(slug, token, body);
  }
}
