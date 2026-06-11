import { Body, Controller, Delete, Param, Post, UseGuards } from '@nestjs/common';
import { signedUploadUrlSchema, signedDownloadUrlSchema, fileLinkSchema, type SignedUploadUrlInput, type SignedDownloadUrlInput, type FileLinkInput } from '@haksan/shared';
import { FilesService } from './files.service';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { AuthGuard } from '../../shared/security/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../shared/security/permissions.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';

@UseGuards(AuthGuard, PermissionsGuard)
@Controller('files')
export class FilesController {
  constructor(private readonly svc: FilesService) {}

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

  @RequirePermissions('files.delete')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    return this.svc.delete(id, user);
  }
}
