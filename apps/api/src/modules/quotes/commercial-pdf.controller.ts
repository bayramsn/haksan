import { Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import type { FastifyReply } from 'fastify';
import { AuthGuard } from '../../shared/security/auth.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import type { AuthContext } from '../../shared/security/auth.types';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { CommercialPdfService } from './commercial-pdf.service';
const kinds = { quotes: 'quote', proformas: 'proforma', contracts: 'contract' } as const;
const kindPipe = new ZodValidationPipe(z.enum(['quotes', 'proformas', 'contracts']));
const optionsPipe = new ZodValidationPipe(z.object({ headerLogoMode: z.enum(['haksan', 'company', 'none']).optional() }).strict().optional());
const idPipe = new ZodValidationPipe(z.string().uuid());
@UseGuards(AuthGuard)
@Controller(':collection')
export class CommercialPdfController {
  constructor(private readonly pdfs: CommercialPdfService) {}
  @Get(':id/pdf/status')
  status(@Param('collection', kindPipe) collection: keyof typeof kinds, @Param('id', idPipe) id: string, @CurrentUser() actor: AuthContext) { return this.pdfs.status(kinds[collection], id, actor); }
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post(':id/pdf')
  prepare(@Param('collection', kindPipe) collection: keyof typeof kinds, @Param('id', idPipe) id: string, @CurrentUser() actor: AuthContext, @Body(optionsPipe) options?: { headerLogoMode?: 'haksan' | 'company' | 'none' }) { return this.pdfs.prepare(kinds[collection], id, actor, options); }
  @Get(':id/pdf')
  async read(@Param('collection', kindPipe) collection: keyof typeof kinds, @Param('id', idPipe) id: string, @CurrentUser() actor: AuthContext, @Res() response: FastifyReply) {
    const { buffer, filename } = await this.pdfs.read(kinds[collection], id, actor);
    response.header('Content-Type', 'application/pdf').header('Content-Disposition', `attachment; filename="${filename}"`).header('Cache-Control', 'private, no-store').send(buffer);
  }
}
