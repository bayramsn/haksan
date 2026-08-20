import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  signatureCreateSchema,
  signatureListQuerySchema,
  signatureUpdateSchema,
  type SignatureCreateInput,
  type SignatureListQuery,
  type SignatureUpdateInput,
} from '@haksan/shared';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { AuthGuard } from '../../shared/security/auth.guard';
import { PermissionsGuard } from '../../shared/security/permissions.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { SignaturesService } from './signatures.service';

/**
 * Belge imzaları (Ayarlar → İmzalar).
 *
 * Okuma teklif ailesini okuyabilen herkese, yazma yalnızca `tenants.update`
 * iznine (super_admin / admin) açıktır — gerekçe: signature-access.ts.
 * Görselin auth'suz sunumu ayrı bir controller'dadır (signature-media).
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('signatures')
export class SignaturesController {
  constructor(private readonly svc: SignaturesService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(signatureListQuerySchema)) query: SignatureListQuery,
    @CurrentUser() user: AuthContext,
  ) {
    return this.svc.list(user, query);
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthContext) {
    return this.svc.get(id, user);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(signatureCreateSchema)) body: SignatureCreateInput,
    @CurrentUser() user: AuthContext,
  ) {
    return this.svc.create(body, user);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(signatureUpdateSchema)) body: SignatureUpdateInput,
    @CurrentUser() user: AuthContext,
  ) {
    return this.svc.update(id, body, user);
  }

  @Delete(':id')
  remove(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthContext) {
    return this.svc.remove(id, user);
  }
}
