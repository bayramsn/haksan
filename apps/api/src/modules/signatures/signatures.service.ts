import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import {
  SIGNATURE_IMAGE_EXTENSIONS,
  SIGNATURE_IMAGE_MAX_BYTES,
  SIGNATURE_IMAGE_MIME_TYPES,
  type DocumentSignatureSnapshot,
  type SignatureCreateInput,
  type SignatureListQuery,
  type SignatureUpdateInput,
  type SignatureView,
} from '@haksan/shared';
import type { DbClient } from '../../db/client';
import { fileDocumentTypes } from '../../db/schema/lookup';
import { fileLinks, files } from '../../db/schema/files';
import { signatures } from '../../db/schema/signatures';
import { DB } from '../../shared/database/database.module';
import { AuditService } from '../../shared/database/audit.service';
import type { AuthContext } from '../../shared/security/auth.types';
import { ForbiddenError, NotFoundError, ValidationError } from '../../shared/utils/errors';
import { assertCanUseResourceDivision, resourceDivisionFilterWithShared } from '../../shared/utils/division-scope';
import { canManageSignatures, canReadSignatures } from './signature-access';
import { signatureMediaPath } from './signature-media.service';

/**
 * İmzalar teklif ailesi belgelerine basıldığı için bölüm kapsamı `quotes`
 * kaynağının kapsamıyla aynı okunur; ayrı bir izin kaynağı tanımlanmadı.
 */
const DIVISION_SCOPE_RESOURCE = 'quotes';

type SignatureRow = typeof signatures.$inferSelect;

@Injectable()
export class SignaturesService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly audit: AuditService,
  ) {}

  private assertCanRead(actor: AuthContext) {
    if (!canReadSignatures(actor)) {
      throw new ForbiddenError('Yetki gerekli: quotes.read');
    }
  }

  private assertCanManage(actor: AuthContext) {
    if (!canManageSignatures(actor)) {
      throw new ForbiddenError('Yetki gerekli: tenants.update');
    }
  }

  private toView(row: SignatureRow): SignatureView {
    return {
      id: row.id,
      name: row.name,
      title: row.title,
      divisionId: row.divisionId,
      fileId: row.fileId,
      imageUrl: row.fileId ? signatureMediaPath(row.fileId) : null,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /**
   * Kiracı + bölüm izolasyonu tek yerde. Bölümsüz ("Tümü") imzalar her zaman
   * görünür; bölüme atanmış imzalar yalnızca o bölümü görebilen kullanıcıya.
   */
  private scopeFilter(actor: AuthContext) {
    return and(
      eq(signatures.tenantId, actor.tenantId),
      isNull(signatures.deletedAt),
      resourceDivisionFilterWithShared(actor, DIVISION_SCOPE_RESOURCE, signatures.divisionId) ?? sql`true`,
    );
  }

  private async findScoped(id: string, actor: AuthContext): Promise<SignatureRow> {
    const [row] = await this.db
      .select()
      .from(signatures)
      .where(and(eq(signatures.id, id), this.scopeFilter(actor)))
      .limit(1);
    // Başka kiracının/bölümün imzası "yok" olarak döner; varlığı sızdırılmaz.
    if (!row) throw new NotFoundError('İmza');
    return row;
  }

  async list(actor: AuthContext, query: SignatureListQuery = {}): Promise<SignatureView[]> {
    this.assertCanRead(actor);
    const filters = [this.scopeFilter(actor)];
    // Belge ekranları yalnız aktifleri ister; ayar ekranı hepsini görür.
    if (query.activeOnly) filters.push(eq(signatures.isActive, true));
    const rows = await this.db
      .select()
      .from(signatures)
      .where(and(...filters))
      .orderBy(asc(signatures.name), asc(signatures.createdAt));
    return rows.map((row) => this.toView(row));
  }

  async get(id: string, actor: AuthContext): Promise<SignatureView> {
    this.assertCanRead(actor);
    return this.toView(await this.findScoped(id, actor));
  }

  async create(input: SignatureCreateInput, actor: AuthContext): Promise<SignatureView> {
    this.assertCanManage(actor);
    const divisionId = input.divisionId ?? null;
    // Kullanıcının yetkisi olmayan bir bölüme imza tanımlaması engellenir.
    // Bilerek `resolveAssignedResourceDivision` kullanılmaz: orada boş istek
    // kullanıcının birincil bölümüne düşer, burada boş istek "Tümü" demektir.
    assertCanUseResourceDivision(actor, DIVISION_SCOPE_RESOURCE, divisionId);

    const [row] = await this.db
      .insert(signatures)
      .values({
        tenantId: actor.tenantId,
        divisionId,
        name: input.name,
        title: input.title,
        isActive: input.isActive ?? true,
        createdBy: actor.userId,
      })
      .returning();

    const fileId = input.fileId ? await this.bindImage(input.fileId, row.id, actor) : null;
    if (fileId) {
      await this.db.update(signatures).set({ fileId }).where(eq(signatures.id, row.id));
    }

    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'signature.created',
      resourceType: 'signature',
      resourceId: row.id,
      newValues: { name: row.name, title: row.title, divisionId, fileId },
    });
    return this.toView({ ...row, fileId });
  }

  async update(id: string, input: SignatureUpdateInput, actor: AuthContext): Promise<SignatureView> {
    this.assertCanManage(actor);
    const existing = await this.findScoped(id, actor);

    const patch: Partial<SignatureRow> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.title !== undefined) patch.title = input.title;
    if (input.isActive !== undefined) patch.isActive = input.isActive;
    if (input.divisionId !== undefined) {
      const divisionId = input.divisionId ?? null;
      assertCanUseResourceDivision(actor, DIVISION_SCOPE_RESOURCE, divisionId);
      patch.divisionId = divisionId;
    }
    if (input.fileId !== undefined) {
      // Eski görsel bilerek silinmez: geçmiş belgeler snapshot'larında onun
      // yolunu taşır ve bağ (file_links) korunduğu için basılmaya devam eder.
      patch.fileId = input.fileId ? await this.bindImage(input.fileId, existing.id, actor) : null;
    }

    if (Object.keys(patch).length > 0) {
      await this.db.update(signatures).set(patch).where(eq(signatures.id, existing.id));
    }
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'signature.updated',
      resourceType: 'signature',
      resourceId: existing.id,
      oldValues: { name: existing.name, title: existing.title, divisionId: existing.divisionId, fileId: existing.fileId, isActive: existing.isActive },
      newValues: patch,
    });
    return this.toView({ ...existing, ...patch });
  }

  async remove(id: string, actor: AuthContext): Promise<{ ok: true }> {
    this.assertCanManage(actor);
    const existing = await this.findScoped(id, actor);
    // Yumuşak silme: imza yeni belgelerde seçilemez olur, geçmiş belgeler
    // kendi snapshot'larındaki imzayı basmaya devam eder.
    await this.db.update(signatures).set({ deletedAt: new Date() }).where(eq(signatures.id, existing.id));
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'signature.deleted',
      resourceType: 'signature',
      resourceId: existing.id,
      oldValues: { name: existing.name, title: existing.title },
    });
    return { ok: true };
  }

  /**
   * Belgeye imza iliştirilirken çağrılır.
   *
   * Kiracı + bölüm izolasyonu `findScoped` üzerinden uygulanır; ek olarak imza
   * aktif olmalıdır — pasife alınmış bir imza yeni belgeye basılamaz.
   * Dönen değer belge tablosuna yazılacak `signatureId` ile
   * `document_snapshot`'a gömülecek kopyayı birlikte verir.
   */
  async resolveForDocument(
    signatureId: string,
    actor: AuthContext,
  ): Promise<{ signatureId: string; snapshot: DocumentSignatureSnapshot }> {
    const row = await this.findScoped(signatureId, actor);
    if (!row.isActive) {
      throw new ValidationError('Pasif imza belgeye eklenemez', { field: 'signatureId' });
    }
    return { signatureId: row.id, snapshot: this.buildSnapshot(row) };
  }

  /** Belgede saklanacak imza kopyası — canlı kayıttan bağımsız, denetim izi. */
  private buildSnapshot(row: SignatureRow): DocumentSignatureSnapshot {
    return {
      id: row.id,
      name: row.name,
      title: row.title,
      fileId: row.fileId,
      imageUrl: row.fileId ? signatureMediaPath(row.fileId) : null,
      capturedAt: new Date().toISOString(),
    };
  }

  /**
   * Yüklenmiş görseli imzaya bağlar ve `fileId`'yi döndürür.
   *
   * Doğrulama istemciye güvenmez: bucket, görünürlük, MIME tipi, uzantı ve
   * boyut sunucu tarafında yeniden kontrol edilir (yükleme sırasındaki zod
   * kontrolü yalnız niyet beyanıdır, bayt sonrası gerçek kayıt burada denetlenir).
   */
  private async bindImage(fileId: string, signatureId: string, actor: AuthContext): Promise<string> {
    const [file] = await this.db
      .select({
        id: files.id,
        bucket: files.bucket,
        mimeType: files.mimeType,
        extension: files.extension,
        sizeBytes: files.sizeBytes,
        visibility: files.visibility,
        uploadStatus: files.uploadStatus,
      })
      .from(files)
      .where(and(eq(files.id, fileId), eq(files.tenantId, actor.tenantId), isNull(files.deletedAt)))
      .limit(1);

    const extension = file?.extension.toLocaleLowerCase('en-US');
    if (
      !file
      || file.bucket !== 'erp-signatures'
      || file.visibility !== 'public'
      || !['uploaded', 'linked'].includes(file.uploadStatus)
      || !(SIGNATURE_IMAGE_MIME_TYPES as readonly string[]).includes(file.mimeType)
      || !extension
      || !(SIGNATURE_IMAGE_EXTENSIONS as readonly string[]).includes(extension)
      || file.sizeBytes <= 0
      || file.sizeBytes > SIGNATURE_IMAGE_MAX_BYTES
    ) {
      throw new ValidationError('İmza görseli geçersiz veya yüklemesi tamamlanmamış', { field: 'fileId' });
    }

    const [existingLink] = await this.db
      .select({ entityId: fileLinks.entityId })
      .from(fileLinks)
      .where(
        and(
          eq(fileLinks.fileId, file.id),
          eq(fileLinks.tenantId, actor.tenantId),
          eq(fileLinks.entityType, 'signature'),
        ),
      )
      .limit(1);
    if (existingLink) {
      // Aynı görselin iki imza tarafından paylaşılmasına izin verilmez; aksi
      // halde bir imzanın görselini değiştirmek diğerini de etkilerdi.
      if (existingLink.entityId !== signatureId) {
        throw new ValidationError('Bu görsel başka bir imzaya bağlı', { field: 'fileId' });
      }
      return file.id;
    }

    const docType = await this.db.query.fileDocumentTypes.findFirst({
      where: eq(fileDocumentTypes.code, 'signature'),
    });
    if (!docType) throw new ValidationError('İmza doküman türü tanımlı değil', { field: 'fileId' });

    await this.db.transaction(async (tx) => {
      await tx.insert(fileLinks).values({
        tenantId: actor.tenantId,
        fileId: file.id,
        entityType: 'signature',
        entityId: signatureId,
        documentTypeId: docType.id,
      });
      // 'linked' aynı zamanda public medya ucunun ön koşuludur.
      await tx
        .update(files)
        .set({ uploadStatus: 'linked' })
        .where(and(eq(files.id, file.id), eq(files.tenantId, actor.tenantId)));
    });

    return file.id;
  }
}
