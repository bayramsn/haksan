import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { paginationSchema, type Pagination } from '@haksan/shared';
import { signedUploadUrlSchema, signedDownloadUrlSchema, fileLinkSchema, type SignedUploadUrlInput, type SignedDownloadUrlInput, type FileLinkInput } from '@haksan/shared';
import { FilesService } from './files.service';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { AuthGuard } from '../../shared/security/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../shared/security/permissions.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { loadEnv } from '../../config/env';

// Dosya yükleme için sıkı, IP-bazlı limit (global throttler'ı override eder) — CLAUDE.md #2.
const UPLOAD_THROTTLE = { default: { limit: loadEnv().RATE_LIMIT_UPLOAD, ttl: 60_000 } };
const fileContentSchema = z
  .instanceof(Buffer)
  .refine((body) => body.byteLength > 0, 'Dosya boyutu sıfır olamaz');

@UseGuards(AuthGuard, PermissionsGuard)
@Controller('files')
export class FilesController {
  constructor(private readonly svc: FilesService) {}

  @Throttle(UPLOAD_THROTTLE)
  @RequirePermissions('files.create')
  @Post('signed-upload-url')
  signedUpload(
    @Body(new ZodValidationPipe(signedUploadUrlSchema)) body: SignedUploadUrlInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.createSignedUploadUrl(body, user);
  }

  @RequirePermissions('files.read')
  @Post('signed-download-url')
  signedDownload(
    @Body(new ZodValidationPipe(signedDownloadUrlSchema)) body: SignedDownloadUrlInput,
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.createSignedDownloadUrl(body, user);
  }

  @RequirePermissions('files.create')
  @Post('link')
  link(@Body(new ZodValidationPipe(fileLinkSchema)) body: FileLinkInput, @CurrentUser() user: AuthContext) {
    return this.svc.linkFile(body, user);
  }

  @Throttle(UPLOAD_THROTTLE)
  @RequirePermissions('files.create')
  @Put(':id/content')
  uploadContent(@Param('id') id: string, @Body(new ZodValidationPipe(fileContentSchema)) body: Buffer, @CurrentUser() user: AuthContext) {
    return this.svc.uploadContent(id, body, user);
  }

  @RequirePermissions('files.read')
  @Get('links')
  listLinks(
    @Query(new ZodValidationPipe(paginationSchema.extend({ entityType: z.string().max(64).optional(), entityId: z.string().uuid().optional() })))
    query: Pagination & { entityType?: string; entityId?: string },
    @CurrentUser() user: AuthContext
  ) {
    return this.svc.listLinks(user, query);
  }

  @RequirePermissions('files.delete')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.svc.delete(id, user);
  }
}
