import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { CommercialPdfKind, CommercialPdfStatus } from '@haksan/shared';
import { DB } from '../../shared/database/database.module';
import type { DbClient } from '../../db/client';
import { commercialPdfs } from '../../db/schema/commercial-pdfs';
import { files } from '../../db/schema/files';
import { productModels } from '../../db/schema/products';
import { StorageService } from '../../shared/storage/storage.service';
import { HtmlPdfService } from '../../shared/pdf/html-pdf.service';
import { inlineRemoteImages } from '../../shared/pdf/remote-image';
import { AuditService } from '../../shared/database/audit.service';
import type { AuthContext } from '../../shared/security/auth.types';
import { AppError, ForbiddenError } from '../../shared/utils/errors';
import { QuotesService } from './quotes.service';
import { renderCommercialHtml } from './commercial-pdf-render';

// v2: dış ürün fotoğrafları gömülüyor. v3: eski kayıtlarda eksik ürün fotoğrafı katalogdan, büyük
// görseller küçültülerek basılıyor. Eski PDF'ler sunulmaya devam eder; "Hazırla" v3 üretir.
const TEMPLATE_VERSION = 'web-2026-11-v3';
const SERVED_TEMPLATE_VERSIONS = [TEMPLATE_VERSION, 'web-2026-11-v2', 'web-2026-10-v1'];
const BLANK_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const resource = { quote: 'quotes', proforma: 'proformas', contract: 'contracts' } as const;

/** Exclude capture wall time, retain all actual document and related business data. */
export function commercialSourceHash(snapshot: Record<string, unknown>): string {
  const stable = (value: any): any => {
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).filter((key) => key !== 'capturedAt').sort().map((key) => [key, stable(value[key])]));
    return value;
  };
  return createHash('sha256').update(JSON.stringify(stable(snapshot))).digest('hex');
}

@Injectable()
export class CommercialPdfService {
  constructor(@Inject(DB) private readonly db: DbClient, private readonly quotes: QuotesService,
    private readonly storage: StorageService, private readonly renderer: HtmlPdfService, private readonly audit: AuditService) {}

  private async source(kind: CommercialPdfKind, id: string, actor: AuthContext) {
    if (!actor.permissions.has(`${resource[kind]}.read`) && !actor.roles.includes('super_admin')) throw new ForbiddenError();
    const record = kind === 'quote' ? await this.quotes.get(id, actor) : kind === 'proforma' ? await this.quotes.getProforma(id, actor) : await this.quotes.getContract(id, actor);
    const row = record as Record<string, any>;
    const snapshot = row.documentSnapshot ?? (kind === 'quote' ? await this.quotes.buildDocumentSnapshot(id, actor) : row.quoteId ? await this.quotes.buildDocumentSnapshot(row.quoteId, actor) : null);
    if (!snapshot) throw new AppError('PDF_SOURCE_MISSING', 'Belgenin kayıtlı içeriği bulunamadı.', 409);
    // Draft quote snapshots must reflect edits. Finalized records always use their frozen data.
    const current = kind === 'quote' && !row.finalizedAt && !row.approvedAt ? await this.quotes.buildDocumentSnapshot(id, actor) : snapshot;
    const data = { ...current, sourceHeader: Object.fromEntries(['id', 'documentNo', 'contractNo', 'issueDate', 'signedDate', 'statusId', 'terms', 'finalizedAt', 'updatedAt'].map((key) => [key, row[key]])) };
    return { record: row, snapshot: current as Record<string, any>, hash: commercialSourceHash(data) };
  }

  private async latest(kind: CommercialPdfKind, id: string, actor: AuthContext) {
    return this.db.query.commercialPdfs.findFirst({ where: and(eq(commercialPdfs.tenantId, actor.tenantId), eq(commercialPdfs.kind, kind), eq(commercialPdfs.documentId, id)), orderBy: desc(commercialPdfs.selectedAt) });
  }

  async status(kind: CommercialPdfKind, id: string, actor: AuthContext): Promise<CommercialPdfStatus> {
    const source = await this.source(kind, id, actor);
    const artifact = await this.latest(kind, id, actor);
    return { status: !artifact ? 'missing' : artifact.sourceHash === source.hash && SERVED_TEMPLATE_VERSIONS.some((v) => artifact.templateVersion.startsWith(`${v}:`)) ? 'ready' : 'outdated', fileId: artifact?.fileId ?? null, revision: artifact?.sourceHash ?? null, documentRevision: artifact?.sourceHash ?? null, generatedAt: artifact?.generatedAt.toISOString() ?? null };
  }

  /** Only records already authorized by the collection service are decorated.
   * Missing PDFs require one batch lookup; saved PDFs receive the same current
   * source check as downloads. Bound concurrency keeps list requests predictable.
   */
  async decorate<T extends { id: string }>(kind: CommercialPdfKind, records: T[], actor: AuthContext): Promise<Array<T & { pdf: CommercialPdfStatus }>> {
    if (!records.length) return [];
    const saved = await this.db.select({ documentId: commercialPdfs.documentId }).from(commercialPdfs)
      .where(and(eq(commercialPdfs.tenantId, actor.tenantId), eq(commercialPdfs.kind, kind), inArray(commercialPdfs.documentId, records.map((record) => record.id))));
    const ids = new Set(saved.map((artifact) => artifact.documentId));
    const result: Array<T & { pdf: CommercialPdfStatus }> = [];
    for (let offset = 0; offset < records.length; offset += 4) {
      result.push(...await Promise.all(records.slice(offset, offset + 4).map(async (record) => ({ ...record,
        pdf: ids.has(record.id) ? await this.status(kind, record.id, actor) : {
          status: 'missing' as const, fileId: null, revision: null, documentRevision: null, generatedAt: null,
        },
      }))));
    }
    return result;
  }

  async read(kind: CommercialPdfKind, id: string, actor: AuthContext) {
    const status = await this.status(kind, id, actor);
    if (status.status !== 'ready') throw new AppError(status.status === 'missing' ? 'PDF_NOT_PREPARED' : 'PDF_OUTDATED', status.status === 'missing' ? 'PDF henüz webde hazırlanmadı.' : 'Belge değişti. PDF webde yeniden hazırlanmalı.', 409);
    const file = await this.db.query.files.findFirst({ where: and(eq(files.id, status.fileId!), eq(files.tenantId, actor.tenantId)) });
    if (!file || file.deletedAt) throw new AppError('PDF_FILE_MISSING', 'Kayıtlı PDF dosyası bulunamadı.', 409);
    const buffer = await this.storage.getObject(file.bucket, file.objectKey);
    if (!buffer) throw new AppError('PDF_FILE_MISSING', 'Kayıtlı PDF dosyası bulunamadı.', 409);
    return { buffer, filename: file.originalFilename };
  }

  /** Eski belge kayıtlarında ürün fotoğrafı alanı yok (ya da fotoğraf sonradan eklendi): yalnız eksik
   * fotoğraf güncel katalogdan alınır; fiyat, metin ve özellikler donmuş kayıttan kalır. */
  private async withCatalogImages(snapshot: Record<string, any>, actor: AuthContext): Promise<Record<string, any>> {
    const items: any[] = snapshot.items ?? [];
    const missing = (i: any) => i.product && !i.product.imageUrl && i.productModelId;
    const ids = [...new Set(items.filter(missing).map((i) => String(i.productModelId)))];
    if (!ids.length) return snapshot;
    const rows = await this.db.select({ id: productModels.id, imageUrl: productModels.imageUrl }).from(productModels)
      .where(and(eq(productModels.tenantId, actor.tenantId), inArray(productModels.id, ids)));
    const image = new Map(rows.filter((r) => r.imageUrl).map((r) => [r.id, r.imageUrl]));
    return { ...snapshot, items: items.map((i) => (missing(i) && image.has(i.productModelId) ? { ...i, product: { ...i.product, imageUrl: image.get(i.productModelId) } } : i)) };
  }

  /** Paket logoları ve kiracının depodaki görselleri doğrudan; dış https görseller `inlineRemoteImages` ile gömülür. */
  private async images(html: string, actor: AuthContext): Promise<string> {
    const sources = [...new Set([...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]))];
    let result = html;
    for (const src of sources) {
      if (src.startsWith('data:image/')) continue;
      let bytes: Buffer | null = null;
      let mime = 'image/png';
      if (/^\/print\/[a-zA-Z0-9_.-]+$/.test(src)) {
        bytes = await readFile(join(__dirname, '../../assets/print', basename(src))).catch(() => null);
        if (/\.jpe?g$/i.test(src)) mime = 'image/jpeg';
      } else {
        const fileId = src.match(/(?:media\/|fileId=)([a-f0-9-]{36})(?:[/?&]|$)/i)?.[1];
        if (fileId) {
          const file = await this.db.query.files.findFirst({ where: and(eq(files.id, fileId), eq(files.tenantId, actor.tenantId)) });
          if (file && !file.deletedAt && file.mimeType.startsWith('image/') && file.sizeBytes <= MAX_IMAGE_BYTES) {
            bytes = await this.storage.getObject(file.bucket, file.objectKey); mime = file.mimeType;
          }
        }
      }
      // Dış https görsel (ürün fotoğraflarının çoğu kurumsal sitede) aşağıda sunucuda indirilir.
      if (!bytes && /^https:\/\//i.test(src)) continue;
      const embedded = bytes && bytes.length <= MAX_IMAGE_BYTES ? `data:${mime};base64,${bytes.toString('base64')}` : BLANK_IMAGE;
      result = result.split(`src="${src}"`).join(`src="${embedded}"`);
    }
    // İndirici yalnız https/443 ve iç ağ dışı adreslere gider; alınamayan görsel boş basılır,
    // böylece Chromium'a hiçbir dış adres ulaşmaz.
    result = await inlineRemoteImages(result);
    return result.replace(/(<img[^>]+src=")https:\/\/[^"]*"/gi, `$1${BLANK_IMAGE}"`);
  }

  async prepare(kind: CommercialPdfKind, id: string, actor: AuthContext, options: { headerLogoMode?: 'haksan' | 'company' | 'none' } = {}): Promise<CommercialPdfStatus> {
    if (!actor.permissions.has(`${resource[kind]}.update`) && !actor.roles.includes('super_admin')) throw new ForbiddenError('PDF hazırlamak için belge düzenleme yetkisi gerekli.');
    let uploaded: { bucket: string; objectKey: string } | undefined;
    let rendered = false;
    try {
      await this.db.transaction(async (tx) => {
        // Cross-process duplicate suppression without a new queue or worker service.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${actor.tenantId}:${kind}:${id}`}, 0))`);
        const source = await this.source(kind, id, actor);
        const selected = kind === 'quote' && !options.headerLogoMode ? await tx.query.commercialPdfs.findFirst({ where: and(eq(commercialPdfs.tenantId, actor.tenantId), eq(commercialPdfs.kind, kind), eq(commercialPdfs.documentId, id)), orderBy: desc(commercialPdfs.selectedAt) }) : null;
        const priorMode = selected?.templateVersion.split(':').at(-1);
        const headerLogoMode = options.headerLogoMode ?? (priorMode === 'company' || priorMode === 'none' ? priorMode : 'haksan');
        const templateVersion = `${TEMPLATE_VERSION}:${kind === 'quote' ? headerLogoMode : 'default'}`;
        const existing = await tx.query.commercialPdfs.findFirst({ where: and(eq(commercialPdfs.tenantId, actor.tenantId), eq(commercialPdfs.kind, kind), eq(commercialPdfs.documentId, id), eq(commercialPdfs.sourceHash, source.hash), eq(commercialPdfs.templateVersion, templateVersion)) });
        if (existing) {
          await tx.update(commercialPdfs).set({ selectedAt: new Date() }).where(eq(commercialPdfs.id, existing.id));
          return;
        }
        if (!this.renderer.isAvailable()) throw new AppError('PDF_UNAVAILABLE', 'Sunucuda PDF üretici kullanılamıyor.', 503);
        const html = await this.images(await renderCommercialHtml(kind, source.record, await this.withCatalogImages(source.snapshot, actor), kind === 'quote' ? headerLogoMode : undefined), actor);
        const buffer = await this.renderer.render(html);
        if (buffer.length > 25 * 1024 * 1024 || buffer.subarray(0, 5).toString() !== '%PDF-') throw new AppError('PDF_INVALID', 'Geçerli PDF oluşturulamadı.', 503);
        if ((await this.source(kind, id, actor)).hash !== source.hash) throw new AppError('PDF_SOURCE_CHANGED', 'Belge hazırlanırken değişti. Yeniden deneyin.', 409);
        const filename = `${kind}-${String(source.record.documentNo ?? source.record.contractNo).replace(/[^a-zA-Z0-9._-]/g, '_')}.pdf`;
        const bucket = 'erp-quote-documents';
        const objectKey = this.storage.buildKey({ tenantId: actor.tenantId, entityType: 'commercial-pdf', entityId: id, filename });
        await this.storage.uploadFile({ bucket, objectKey, body: buffer, mimeType: 'application/pdf', contentLength: buffer.length });
        uploaded = { bucket, objectKey };
        const [file] = await tx.insert(files).values({ tenantId: actor.tenantId, bucket, objectKey, originalFilename: filename, mimeType: 'application/pdf', extension: 'pdf', sizeBytes: buffer.length, sha256: this.storage.calculateChecksum(buffer), visibility: 'private', uploadStatus: 'linked', uploadedBy: actor.userId, uploadedAt: new Date() }).returning();
        await tx.insert(commercialPdfs).values({ tenantId: actor.tenantId, kind, documentId: id, sourceHash: source.hash, templateVersion, fileId: file.id, snapshot: source.snapshot, generatedBy: actor.userId });
        rendered = true;
      });
    } catch (error) {
      if (uploaded) await this.storage.deleteFile(uploaded.bucket, uploaded.objectKey).catch(() => undefined);
      throw error;
    }
    if (rendered) await this.audit.write({ tenantId: actor.tenantId, actorUserId: actor.userId, action: 'commercial_pdf.prepared', resourceType: kind, resourceId: id });
    return this.status(kind, id, actor);
  }
}
