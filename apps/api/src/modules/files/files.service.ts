import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import type { Pagination } from '@haksan/shared';
import { buildPaginated, pageOffset } from '../../shared/utils/pagination';
import { users } from '../../db/schema/users';
import type { DbClient } from '../../db/client';
import { files, fileLinks } from '../../db/schema/files';
import { fileDocumentTypes, productGroups, storageProviders } from '../../db/schema/lookup';
import { companies } from '../../db/schema/companies';
import { opportunities, salesActivities } from '../../db/schema/crm';
import { customerDevices } from '../../db/schema/inventory';
import { productModels } from '../../db/schema/products';
import { quotes } from '../../db/schema/quotes';
import { serviceComplaintIntakes, serviceTickets } from '../../db/schema/service';
import { chatMessages, conversationMembers, conversations } from '../../db/schema/chat';
import { DB } from '../../shared/database/database.module';
import { StorageService } from '../../shared/storage/storage.service';
import { ForbiddenError, NotFoundError, ValidationError } from '../../shared/utils/errors';
import type { AuthContext } from '../../shared/security/auth.types';
import { loadEnv } from '../../config/env';
import type { SignedUploadUrlInput, FileLinkInput, SignedDownloadUrlInput } from '@haksan/shared';
import { AuditService } from '../../shared/database/audit.service';
import {
  resourceCompanyPortfolioFilter,
  resourceDivisionFilter,
  resourceDivisionFilterWithShared,
} from '../../shared/utils/division-scope';
import {
  allowUnlinkedCompanyRecords,
  companyVisibilityExistsFilter,
  companyVisibilityFilter,
} from '../../shared/utils/company-visibility';

@Injectable()
export class FilesService {
  private env = loadEnv();

  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly storage: StorageService,
    private readonly audit: AuditService
  ) {}

  private async assertEntityVisible(entityType: string, entityId: string, actor: AuthContext): Promise<void> {
    switch (entityType) {
      case 'company': {
        const visibility = await companyVisibilityFilter(this.db, actor);
        const [row] = await this.db
          .select({ id: companies.id })
          .from(companies)
          .where(
            and(
              eq(companies.id, entityId),
              eq(companies.tenantId, actor.tenantId),
              isNull(companies.deletedAt),
              resourceCompanyPortfolioFilter(actor, 'companies', companies.id) ?? sql`true`,
              allowUnlinkedCompanyRecords(opportunities.companyId, visibility)
            )
          )
          .limit(1);
        if (row) return;
        break;
      }
      case 'opportunity': {
        const visibility = await companyVisibilityExistsFilter(this.db, actor, opportunities.companyId);
        const [row] = await this.db
          .select({ id: opportunities.id })
          .from(opportunities)
          .where(
            and(
              eq(opportunities.id, entityId),
              eq(opportunities.tenantId, actor.tenantId),
              isNull(opportunities.deletedAt),
              resourceDivisionFilter(actor, 'opportunities', opportunities.divisionId) ?? sql`true`,
              visibility ?? sql`true`
            )
          )
          .limit(1);
        if (row) return;
        break;
      }
      case 'sales_activity': {
        const visibility = await companyVisibilityExistsFilter(this.db, actor, salesActivities.companyId);
        const [row] = await this.db
          .select({ id: salesActivities.id })
          .from(salesActivities)
          .where(
            and(
              eq(salesActivities.id, entityId),
              eq(salesActivities.tenantId, actor.tenantId),
              isNull(salesActivities.deletedAt),
              resourceDivisionFilter(actor, 'activities', salesActivities.divisionId) ?? sql`true`,
              visibility ?? sql`true`
            )
          )
          .limit(1);
        if (row) return;
        break;
      }
      case 'quote': {
        const visibility = await companyVisibilityExistsFilter(this.db, actor, quotes.companyId);
        const [row] = await this.db
          .select({ id: quotes.id })
          .from(quotes)
          .where(
            and(
              eq(quotes.id, entityId),
              eq(quotes.tenantId, actor.tenantId),
              isNull(quotes.deletedAt),
              resourceDivisionFilter(actor, 'quotes', quotes.divisionId) ?? sql`true`,
              visibility ?? sql`true`
            )
          )
          .limit(1);
        if (row) return;
        break;
      }
      case 'service_ticket': {
        const visibility = await companyVisibilityExistsFilter(this.db, actor, serviceTickets.companyId);
        const [row] = await this.db
          .select({ id: serviceTickets.id })
          .from(serviceTickets)
          .where(
            and(
              eq(serviceTickets.id, entityId),
              eq(serviceTickets.tenantId, actor.tenantId),
              isNull(serviceTickets.deletedAt),
              resourceDivisionFilter(actor, 'service_tickets', serviceTickets.divisionId) ?? sql`true`,
              visibility ?? sql`true`
            )
          )
          .limit(1);
        if (row) return;
        break;
      }
      case 'service_complaint_intake': {
        const visibility = await companyVisibilityExistsFilter(this.db, actor, serviceComplaintIntakes.companyId);
        const filters = [
          eq(serviceComplaintIntakes.id, entityId),
          eq(serviceComplaintIntakes.tenantId, actor.tenantId),
          isNull(serviceComplaintIntakes.deletedAt),
          resourceDivisionFilter(actor, 'service_tickets', serviceComplaintIntakes.divisionId) ?? sql`true`,
        ];
        if (visibility) filters.push(or(isNull(serviceComplaintIntakes.companyId), visibility) ?? sql`true`);
        const [row] = await this.db.select({ id: serviceComplaintIntakes.id }).from(serviceComplaintIntakes).where(and(...filters)).limit(1);
        if (row) return;
        break;
      }
      case 'customer_device': {
        const visibility = await companyVisibilityExistsFilter(this.db, actor, customerDevices.companyId);
        const [row] = await this.db
          .select({ id: customerDevices.id })
          .from(customerDevices)
          .where(
            and(
              eq(customerDevices.id, entityId),
              eq(customerDevices.tenantId, actor.tenantId),
              isNull(customerDevices.deletedAt),
              resourceDivisionFilter(actor, 'customer_devices', customerDevices.divisionId) ?? sql`true`,
              visibility ?? sql`true`
            )
          )
          .limit(1);
        if (row) return;
        break;
      }
      case 'product':
      case 'product_model': {
        const [row] = await this.db
          .select({ id: productModels.id })
          .from(productModels)
          .leftJoin(productGroups, eq(productModels.productGroupId, productGroups.id))
          .where(
            and(
              eq(productModels.id, entityId),
              eq(productModels.tenantId, actor.tenantId),
              isNull(productModels.deletedAt),
              resourceDivisionFilterWithShared(actor, 'products', productGroups.divisionId) ?? sql`true`
            )
          )
          .limit(1);
        if (row) return;
        break;
      }
      case 'chat_message': {
        const [row] = await this.db
          .select({ id: chatMessages.id })
          .from(chatMessages)
          .innerJoin(conversations, eq(chatMessages.conversationId, conversations.id))
          .innerJoin(conversationMembers, eq(chatMessages.conversationId, conversationMembers.conversationId))
          .where(
            and(
              eq(chatMessages.id, entityId),
              eq(chatMessages.tenantId, actor.tenantId),
              isNull(chatMessages.deletedAt),
              eq(conversations.tenantId, actor.tenantId),
              isNull(conversations.deletedAt),
              eq(conversationMembers.userId, actor.userId)
            )
          )
          .limit(1);
        if (row) return;
        break;
      }
      default:
        break;
    }
    throw new ForbiddenError('Dosyaya erişim yetkiniz yok');
  }

  private async assertUploadTargetAccessible(entityType: string, entityId: string, actor: AuthContext): Promise<void> {
    if (entityType === 'product_draft') {
      if (entityId === 'new' && actor.permissions.has('products.create')) return;
      throw new ForbiddenError('Yeni ürün görseli yükleme yetkiniz yok');
    }

    if (entityType === 'chat_conversation') {
      const [row] = await this.db
        .select({
          id: conversations.id,
          type: conversations.type,
          onlyAdminsCanPost: conversations.onlyAdminsCanPost,
          memberRole: conversationMembers.role,
        })
        .from(conversations)
        .innerJoin(conversationMembers, eq(conversations.id, conversationMembers.conversationId))
        .where(
          and(
            eq(conversations.id, entityId),
            eq(conversations.tenantId, actor.tenantId),
            isNull(conversations.deletedAt),
            eq(conversationMembers.userId, actor.userId)
          )
        )
        .limit(1);
      if (
        row &&
        (row.type !== 'group' || !row.onlyAdminsCanPost || row.memberRole === 'admin' || actor.roles.includes('super_admin'))
      ) {
        return;
      }
      throw new ForbiddenError('Bu sohbete dosya ekleme yetkiniz yok');
    }

    await this.assertEntityVisible(entityType, entityId, actor);
  }

  private async canSeeLinkedEntity(entityType: string, entityId: string, actor: AuthContext): Promise<boolean> {
    try {
      await this.assertEntityVisible(entityType, entityId, actor);
      return true;
    } catch {
      return false;
    }
  }

  private async assertFileReadable(
    file: { id: string; uploadedBy: string | null; visibility: string; uploadStatus: string },
    actor: AuthContext
  ): Promise<void> {
    if (!['uploaded', 'linked'].includes(file.uploadStatus)) throw new NotFoundError('Dosya');
    const links = await this.db
      .select({ entityType: fileLinks.entityType, entityId: fileLinks.entityId })
      .from(fileLinks)
      .where(and(eq(fileLinks.fileId, file.id), eq(fileLinks.tenantId, actor.tenantId)));
    if (links.length === 0) {
      if (file.visibility === 'public' || file.uploadedBy === actor.userId) return;
      throw new ForbiddenError('Dosyaya erişim yetkiniz yok');
    }
    for (const link of links) {
      if (await this.canSeeLinkedEntity(link.entityType, link.entityId, actor)) return;
    }
    throw new ForbiddenError('Dosyaya erişim yetkiniz yok');
  }

  async createSignedUploadUrl(input: SignedUploadUrlInput, actor: AuthContext) {
    this.storage.validateUploadIntent({
      filename: input.filename,
      mimeType: input.mimeType,
      extension: input.extension,
      sizeBytes: input.sizeBytes,
    });
    await this.assertUploadTargetAccessible(input.entityType, input.entityId, actor);
    const objectKey = this.storage.buildKey({
      tenantId: actor.tenantId,
      entityType: input.entityType,
      entityId: input.entityId,
      filename: input.filename,
    });
    // Pre-register file metadata (caller will confirm + link via /files/link)
    const provider = await this.db.query.storageProviders.findFirst({
      where: eq(storageProviders.code, this.env.S3_PROVIDER),
    });
    const [file] = await this.db
      .insert(files)
      .values({
        tenantId: actor.tenantId,
        bucket: input.bucket,
        objectKey,
        originalFilename: input.filename,
        mimeType: input.mimeType,
        extension: input.extension,
        sizeBytes: input.sizeBytes,
        storageProviderId: provider?.id ?? null,
        // Ürün pazarlama görselleri (teklif/katalog fotoğrafı) auth'suz public
        // /products/media/:id ucundan sunulur; diğer belgeler private kalır.
        visibility: input.bucket === 'erp-product-images' ? 'public' : 'private',
        uploadedBy: actor.userId,
      })
      .returning();
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'file.signed_upload_url',
      resourceType: 'file',
      resourceId: file.id,
      newValues: { bucket: input.bucket, objectKey, sizeBytes: input.sizeBytes },
    });
    return {
      fileId: file.id,
      bucket: input.bucket,
      objectKey,
      uploadUrl: `${this.env.API_PREFIX.replace(/\/$/, '')}/files/${file.id}/content`,
      expiresInSeconds: this.env.SIGNED_URL_EXPIRE_SECONDS,
    };
  }

  async createSignedDownloadUrl(input: SignedDownloadUrlInput, actor: AuthContext) {
    const file = await this.db.query.files.findFirst({
      where: and(eq(files.id, input.fileId), eq(files.tenantId, actor.tenantId)),
    });
    if (!file || file.deletedAt || !['uploaded', 'linked'].includes(file.uploadStatus)) throw new NotFoundError('Dosya');
    await this.assertFileReadable(file, actor);
    const url = await this.storage.getSignedDownloadUrl({
      actorTenantId: actor.tenantId,
      bucket: file.bucket,
      objectKey: file.objectKey,
    });
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'file.signed_download_url',
      resourceType: 'file',
      resourceId: file.id,
    });
    return { downloadUrl: url, filename: file.originalFilename, mimeType: file.mimeType };
  }

  async linkFile(input: FileLinkInput, actor: AuthContext) {
    const file = await this.db.query.files.findFirst({
      where: and(eq(files.id, input.fileId), eq(files.tenantId, actor.tenantId)),
    });
    if (!file || file.deletedAt || file.uploadStatus !== 'uploaded') throw new NotFoundError('Dosya');
    if (file.uploadedBy !== actor.userId) {
      throw new ForbiddenError('Yalnızca dosyayı yükleyen kullanıcı dosyayı bağlayabilir');
    }
    await this.assertEntityVisible(input.entityType, input.entityId, actor);
    const docType = await this.db.query.fileDocumentTypes.findFirst({
      where: eq(fileDocumentTypes.code, input.documentTypeCode),
    });
    if (!docType) throw new ValidationError(`Bilinmeyen doküman türü: ${input.documentTypeCode}`);
    return this.db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(files)
        .set({ uploadStatus: 'linked' })
        .where(and(eq(files.id, file.id), eq(files.tenantId, actor.tenantId), eq(files.uploadStatus, 'uploaded')))
        .returning({ id: files.id });
      if (!claimed) throw new ValidationError('Dosya zaten başka bir kayda bağlanmış');
      const [link] = await tx
        .insert(fileLinks)
        .values({
          tenantId: actor.tenantId,
          fileId: file.id,
          entityType: input.entityType,
          entityId: input.entityId,
          documentTypeId: docType.id,
          description: input.description ?? null,
        })
        .returning();
      return link;
    });
  }

  async uploadContent(fileId: string, body: Buffer, actor: AuthContext) {
    const file = await this.db.query.files.findFirst({
      where: and(eq(files.id, fileId), eq(files.tenantId, actor.tenantId)),
    });
    if (!file || file.deletedAt) throw new NotFoundError('Dosya');
    if (file.uploadedBy !== actor.userId) {
      throw new ForbiddenError('Yalnızca dosyayı yükleyen kullanıcı içerik yükleyebilir');
    }
    if (file.uploadStatus !== 'pending') {
      throw new ValidationError('Bu dosya için yükleme tamamlanmış veya devam ediyor');
    }

    if (!Buffer.isBuffer(body)) throw new ValidationError('Dosya gövdesi okunamadı.');
    if (body.byteLength <= 0) throw new ValidationError('Dosya boyutu sıfır olamaz');
    if (body.byteLength !== file.sizeBytes) {
      throw new ValidationError(`Dosya boyutu eşleşmiyor. Beklenen ${file.sizeBytes} byte, gelen ${body.byteLength} byte.`);
    }

    this.storage.validateUploadIntent({
      filename: file.originalFilename,
      mimeType: file.mimeType,
      extension: file.extension,
      sizeBytes: body.byteLength,
    });
    const [claimed] = await this.db
      .update(files)
      .set({ uploadStatus: 'uploading' })
      .where(
        and(
          eq(files.id, file.id),
          eq(files.tenantId, actor.tenantId),
          eq(files.uploadedBy, actor.userId),
          eq(files.uploadStatus, 'pending'),
          isNull(files.deletedAt)
        )
      )
      .returning({ id: files.id });
    if (!claimed) throw new ValidationError('Bu dosya için yükleme tamamlanmış veya devam ediyor');

    try {
      // İçerik (magic-byte) doğrulaması: istemcinin beyan ettiği MIME'a güvenme; gerçek
      // baytlardan türü tespit edip kayıtlı MIME ve uzantıyla eşleştir.
      await this.storage.validateActualFile(body, { mimeType: file.mimeType, extension: file.extension });
      await this.storage.uploadFile({
        bucket: file.bucket,
        objectKey: file.objectKey,
        body,
        mimeType: file.mimeType,
        contentLength: body.byteLength,
      });
      await this.db
        .update(files)
        .set({ uploadStatus: 'uploaded', uploadedAt: new Date(), sha256: this.storage.calculateChecksum(body) })
        .where(and(eq(files.id, file.id), eq(files.uploadStatus, 'uploading')));
    } catch (error) {
      await this.db
        .update(files)
        .set({ uploadStatus: 'pending' })
        .where(and(eq(files.id, file.id), eq(files.uploadStatus, 'uploading')));
      throw error;
    }
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'file.proxy_upload',
      resourceType: 'file',
      resourceId: file.id,
      newValues: { bucket: file.bucket, objectKey: file.objectKey, sizeBytes: body.byteLength },
    });
    return { ok: true, fileId: file.id };
  }

  async listLinks(actor: AuthContext, query: Pagination & { entityType?: string; entityId?: string }) {
    const { limit, offset } = pageOffset(query);
    if (query.entityType && query.entityId) {
      await this.assertEntityVisible(query.entityType, query.entityId, actor);
    }
    const filters = [eq(fileLinks.tenantId, actor.tenantId), isNull(files.deletedAt), eq(files.uploadStatus, 'linked')];
    if (query.entityType) filters.push(eq(fileLinks.entityType, query.entityType));
    if (query.entityId) filters.push(eq(fileLinks.entityId, query.entityId));
    const where = and(...filters);
    const rows = await this.db
      .select({
        link: fileLinks,
        file: files,
        docType: { code: fileDocumentTypes.code, name: fileDocumentTypes.name },
        uploader: { id: users.id, fullName: users.fullName },
      })
      .from(fileLinks)
      .innerJoin(files, eq(fileLinks.fileId, files.id))
      .leftJoin(fileDocumentTypes, eq(fileLinks.documentTypeId, fileDocumentTypes.id))
      .leftJoin(users, eq(files.uploadedBy, users.id))
      .where(where)
      .orderBy(desc(files.createdAt));
    const visibleRows = [];
    for (const row of rows) {
      if (await this.canSeeLinkedEntity(row.link.entityType, row.link.entityId, actor)) visibleRows.push(row);
    }
    const pageRows = visibleRows.slice(offset, offset + limit);
    return buildPaginated(
      pageRows.map((r) => ({
        ...r.link,
        file: {
          id: r.file.id,
          originalFilename: r.file.originalFilename,
          mimeType: r.file.mimeType,
          sizeBytes: r.file.sizeBytes,
          createdAt: r.file.createdAt,
          uploadedBy: r.uploader?.id ?? r.file.uploadedBy,
          uploaderName: r.uploader?.fullName ?? null,
        },
        documentType: r.docType,
      })),
      visibleRows.length,
      query
    );
  }

  async delete(fileId: string, actor: AuthContext): Promise<void> {
    const file = await this.db.query.files.findFirst({
      where: and(eq(files.id, fileId), eq(files.tenantId, actor.tenantId)),
    });
    if (!file || file.deletedAt) throw new NotFoundError('Dosya');
    if (file.uploadedBy !== actor.userId) {
      throw new ForbiddenError('Yalnızca dosyayı yükleyen kullanıcı dosyayı silebilir');
    }
    if (file.uploadStatus === 'uploading') throw new ValidationError('Yüklenmekte olan dosya silinemez');
    if (file.uploadStatus !== 'pending') await this.assertFileReadable(file, actor);
    await this.db.update(files).set({ deletedAt: new Date() }).where(eq(files.id, fileId));
    // Soft delete only — physical object remains; lifecycle policy can sweep later.
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'file.deleted',
      resourceType: 'file',
      resourceId: file.id,
    });
  }
}
