import { Body, Controller, Get, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DbClient } from '../../db/client';
import {
  serviceComplaintIntakes,
  serviceComplaintLinks,
  serviceTickets,
  serviceWarrantyClaims,
} from '../../db/schema/service';
import { fileDocumentTypes, serviceTicketStatuses, storageProviders } from '../../db/schema/lookup';
import { companies, notifications } from '../../db/schema/companies';
import { customerDevices, inventoryItems } from '../../db/schema/inventory';
import { productModels, brands } from '../../db/schema/products';
import { fileLinks, files } from '../../db/schema/files';
import { roles, userDivisions, userRoles, users as usersTable } from '../../db/schema/users';
import { DB } from '../../shared/database/database.module';
import { StorageService } from '../../shared/storage/storage.service';
import { AuthGuard } from '../../shared/security/auth.guard';
import { CurrentUser } from '../../shared/security/current-user.decorator';
import { PermissionsGuard, RequirePermissions } from '../../shared/security/permissions.guard';
import type { AuthContext } from '../../shared/security/auth.types';
import { NotFoundError, ValidationError } from '../../shared/utils/errors';
import { buildPaginated, pageOffset } from '../../shared/utils/pagination';
import { divisionFilter, resolveActorDivisionScope, resolveAssignedDivision } from '../../shared/utils/division-scope';
import { ZodValidationPipe } from '../../shared/utils/zod-pipe';
import { loadEnv } from '../../config/env';
import {
  paginationSchema,
  publicServiceComplaintSchema,
  serviceComplaintConvertSchema,
  serviceComplaintCreateSchema,
  serviceComplaintLinkCreateSchema,
  serviceComplaintRejectSchema,
  serviceComplaintSourceSchema,
  serviceComplaintStatusSchema,
  serviceComplaintUpdateSchema,
  signedUploadUrlSchema,
} from '@haksan/shared';

const complaintListQuery = paginationSchema.extend({
  status: serviceComplaintStatusSchema.optional(),
  source: serviceComplaintSourceSchema.optional(),
  companyId: z.string().uuid().optional(),
  customerDeviceId: z.string().uuid().optional(),
});
const complaintLinkListQuery = paginationSchema.extend({
  companyId: z.string().uuid().optional(),
  customerDeviceId: z.string().uuid().optional(),
});
const publicComplaintUploadSchema = signedUploadUrlSchema
  .pick({ bucket: true, filename: true, mimeType: true, extension: true, sizeBytes: true })
  .extend({ bucket: z.literal('erp-service-documents').default('erp-service-documents') });

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function slugify(value: string): string {
  const normalized = value
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return normalized || `sikayet-${randomBytes(4).toString('hex')}`;
}

function cleanNullableText(value: string | null | undefined) {
  const text = value?.trim();
  return text ? text : null;
}

function isoDate(value: Date | string | null | undefined) {
  return value ? new Date(value).toISOString() : null;
}

type ComplaintLink = typeof serviceComplaintLinks.$inferSelect;

function complaintLinkToken(tenantId: string, linkId: string) {
  const env = loadEnv();
  const secret = env.PUBLIC_LINK_SECRET || env.JWT_ACCESS_SECRET;
  return createHash('sha256').update(`${tenantId}:${linkId}:${secret}`).digest('base64url');
}

function legacyComplaintLinkToken(tenantId: string, linkId: string) {
  return createHash('sha256').update(`${tenantId}:${linkId}:${loadEnv().JWT_ACCESS_SECRET}`).digest('base64url');
}

function validComplaintLinkToken(link: ComplaintLink, token: string) {
  if (tokenHash(token) === link.accessTokenHash) return true;
  const tokens = new Set([complaintLinkToken(link.tenantId, link.id), legacyComplaintLinkToken(link.tenantId, link.id)]);
  return tokens.has(token);
}

function safeCallAssistantMetadata(metadata?: Record<string, unknown> | null) {
  const callAssistantSuggestionId = typeof metadata?.callAssistantSuggestionId === 'string' ? metadata.callAssistantSuggestionId : null;
  const callEventId = typeof metadata?.callEventId === 'string' ? metadata.callEventId : null;
  if (!callAssistantSuggestionId && !callEventId) return null;
  return { callAssistantSuggestionId, callEventId };
}

async function notifyComplaintCreated(
  db: DbClient,
  params: {
    tenantId: string;
    divisionId: string | null;
    complaintId: string;
    complaintNo: string;
    subject: string;
    source: string;
  }
) {
  const filters = [
    eq(usersTable.tenantId, params.tenantId),
    eq(usersTable.status, 'active'),
    isNull(usersTable.deletedAt),
    inArray(roles.code, ['service', 'admin', 'super_admin']),
  ];
  if (params.divisionId) {
    filters.push(or(inArray(roles.code, ['admin', 'super_admin']), eq(userDivisions.divisionId, params.divisionId))!);
  }
  const targets = await db
    .selectDistinct({ userId: usersTable.id })
    .from(usersTable)
    .innerJoin(userRoles, eq(userRoles.userId, usersTable.id))
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .leftJoin(userDivisions, eq(userDivisions.userId, usersTable.id))
    .where(and(...filters));
  if (!targets.length) return;
  await db.insert(notifications).values(
    targets.map((target) => ({
      tenantId: params.tenantId,
      userId: target.userId,
      divisionId: params.divisionId,
      type: 'service_complaint_new',
      title: 'Yeni şikayet kaydı',
      body: `${params.complaintNo} · ${params.source.toUpperCase()} · ${params.subject}`,
      entityType: 'service_complaint_intake',
      entityId: params.complaintId,
    }))
  );
}

@UseGuards(AuthGuard, PermissionsGuard)
@Controller()
export class ServiceComplaintsController {
  constructor(@Inject(DB) private readonly db: DbClient) {}

  private publicPath(slug: string, token: string, source?: 'qr') {
    const base = `/public/service-complaints/${encodeURIComponent(slug)}/${encodeURIComponent(token)}`;
    return source === 'qr' ? `${base}?source=qr` : base;
  }

  private async assertCompany(companyId: string, tenantId: string) {
    const company = await this.db.query.companies.findFirst({
      where: and(eq(companies.id, companyId), eq(companies.tenantId, tenantId), isNull(companies.deletedAt)),
    });
    if (!company) throw new NotFoundError('Firma');
    return company;
  }

  private async assertDevice(deviceId: string, tenantId: string, companyId?: string | null) {
    const device = await this.db.query.customerDevices.findFirst({
      where: and(eq(customerDevices.id, deviceId), eq(customerDevices.tenantId, tenantId), isNull(customerDevices.deletedAt)),
    });
    if (!device) throw new NotFoundError('Makine');
    if (companyId && device.companyId !== companyId) throw new ValidationError('Makine seçilen firmaya ait değil');
    return device;
  }

  private async assertAssignedUser(userId: string, tenantId: string) {
    const user = await this.db.query.users.findFirst({
      where: and(eq(usersTable.id, userId), eq(usersTable.tenantId, tenantId), isNull(usersTable.deletedAt)),
    });
    if (!user) throw new NotFoundError('Kullanıcı');
    return user;
  }

  private async nextComplaintNo(tenantId: string) {
    const [{ c }] = await this.db.select({ c: sql<number>`count(*)::int` }).from(serviceComplaintIntakes).where(eq(serviceComplaintIntakes.tenantId, tenantId));
    const year = new Date().getUTCFullYear();
    return `CMP-${year}-${String(c + 1).padStart(4, '0')}`;
  }

  private async nextServiceTicketNo(tenantId: string) {
    const [{ c }] = await this.db.select({ c: sql<number>`count(*)::int` }).from(serviceTickets).where(eq(serviceTickets.tenantId, tenantId));
    const year = new Date().getUTCFullYear();
    return `SVC-${year}-${String(c + 1).padStart(4, '0')}`;
  }

  private coverageSuggestion(device?: { warrantyStartDate: Date | null; warrantyEndDate: Date | null } | null) {
    if (!device?.warrantyEndDate) return 'unknown';
    const now = Date.now();
    const start = device.warrantyStartDate?.getTime();
    const end = device.warrantyEndDate.getTime();
    if (start && start > now) return 'unknown';
    return end >= now ? 'in_warranty' : 'out_of_warranty';
  }

  private async complaintAttachments(complaintId: string, tenantId: string) {
    const rows = await this.db
      .select({
        link: fileLinks,
        file: files,
        docType: { code: fileDocumentTypes.code, name: fileDocumentTypes.name },
      })
      .from(fileLinks)
      .innerJoin(files, eq(fileLinks.fileId, files.id))
      .leftJoin(fileDocumentTypes, eq(fileLinks.documentTypeId, fileDocumentTypes.id))
      .where(
        and(
          eq(fileLinks.tenantId, tenantId),
          eq(fileLinks.entityType, 'service_complaint_intake'),
          eq(fileLinks.entityId, complaintId),
          isNull(files.deletedAt)
        )
      )
      .orderBy(desc(fileLinks.createdAt));
    return rows.map((row) => ({
      id: row.link.id,
      fileId: row.file.id,
      originalFilename: row.file.originalFilename,
      mimeType: row.file.mimeType,
      sizeBytes: row.file.sizeBytes,
      documentTypeCode: row.docType?.code ?? null,
      documentTypeName: row.docType?.name ?? null,
      description: row.link.description,
      createdAt: isoDate(row.link.createdAt),
    }));
  }

  private async complaintEvidenceDocumentTypeId() {
    const docType = await this.db.query.fileDocumentTypes.findFirst({
      where: eq(fileDocumentTypes.code, 'service_complaint_evidence'),
    });
    if (!docType) throw new ValidationError('service_complaint_evidence doküman tipi bulunamadı');
    return docType.id;
  }

  private async linkAttachmentFileIds(complaintId: string, tenantId: string, fileIds?: string[]) {
    if (!fileIds?.length) return;
    const uniqueIds = [...new Set(fileIds)];
    const validFiles = await this.db
      .select({ id: files.id })
      .from(files)
      .where(and(eq(files.tenantId, tenantId), inArray(files.id, uniqueIds), isNull(files.deletedAt)));
    if (validFiles.length !== uniqueIds.length) throw new ValidationError('Geçersiz şikayet kanıt dosyası');
    const existing = await this.db
      .select({ fileId: fileLinks.fileId })
      .from(fileLinks)
      .where(
        and(
          eq(fileLinks.tenantId, tenantId),
          eq(fileLinks.entityType, 'service_complaint_intake'),
          eq(fileLinks.entityId, complaintId),
          inArray(fileLinks.fileId, uniqueIds)
        )
      );
    const existingSet = new Set(existing.map((row) => row.fileId));
    const missing = uniqueIds.filter((fileId) => !existingSet.has(fileId));
    if (!missing.length) return;
    const documentTypeId = await this.complaintEvidenceDocumentTypeId();
    await this.db.insert(fileLinks).values(
      missing.map((fileId) => ({
        tenantId,
        fileId,
        entityType: 'service_complaint_intake',
        entityId: complaintId,
        documentTypeId,
      }))
    );
  }

  private async copyComplaintFilesToTicket(complaintId: string, ticketId: string, tenantId: string) {
    const complaintLinks = await this.db
      .select()
      .from(fileLinks)
      .where(and(eq(fileLinks.tenantId, tenantId), eq(fileLinks.entityType, 'service_complaint_intake'), eq(fileLinks.entityId, complaintId)));
    if (!complaintLinks.length) return;
    const existing = await this.db
      .select({ fileId: fileLinks.fileId })
      .from(fileLinks)
      .where(
        and(
          eq(fileLinks.tenantId, tenantId),
          eq(fileLinks.entityType, 'service_ticket'),
          eq(fileLinks.entityId, ticketId),
          inArray(fileLinks.fileId, complaintLinks.map((row) => row.fileId))
        )
      );
    const existingSet = new Set(existing.map((row) => row.fileId));
    const missing = complaintLinks.filter((row) => !existingSet.has(row.fileId));
    if (!missing.length) return;
    await this.db.insert(fileLinks).values(
      missing.map((row) => ({
        tenantId,
        fileId: row.fileId,
        entityType: 'service_ticket',
        entityId: ticketId,
        documentTypeId: row.documentTypeId,
        description: row.description,
      }))
    );
  }

  private async ensureWarrantyClaim(ticket: typeof serviceTickets.$inferSelect) {
    const existing = await this.db.query.serviceWarrantyClaims.findFirst({
      where: and(eq(serviceWarrantyClaims.serviceTicketId, ticket.id), eq(serviceWarrantyClaims.tenantId, ticket.tenantId), isNull(serviceWarrantyClaims.deletedAt)),
    });
    if (existing) return existing;
    const device = ticket.customerDeviceId
      ? await this.db.query.customerDevices.findFirst({
          where: and(eq(customerDevices.id, ticket.customerDeviceId), eq(customerDevices.tenantId, ticket.tenantId), isNull(customerDevices.deletedAt)),
        })
      : null;
    const [claim] = await this.db
      .insert(serviceWarrantyClaims)
      .values({
        tenantId: ticket.tenantId,
        divisionId: ticket.divisionId ?? null,
        serviceTicketId: ticket.id,
        companyId: ticket.companyId,
        customerDeviceId: ticket.customerDeviceId ?? null,
        warrantyStartSnapshot: device?.warrantyStartDate ?? null,
        warrantyEndSnapshot: device?.warrantyEndDate ?? null,
        coverageSuggestion: this.coverageSuggestion(device),
      })
      .returning();
    return claim;
  }

  private async scopedIntake(id: string, user: AuthContext) {
    const intake = await this.db.query.serviceComplaintIntakes.findFirst({
      where: and(
        eq(serviceComplaintIntakes.id, id),
        eq(serviceComplaintIntakes.tenantId, user.tenantId),
        isNull(serviceComplaintIntakes.deletedAt),
        divisionFilter(resolveActorDivisionScope(user), serviceComplaintIntakes.divisionId) ?? sql`true`
      ),
    });
    if (!intake) throw new NotFoundError('Şikayet kaydı');
    return intake;
  }

  private async mapComplaintRow(row: any) {
    const warrantyStatusSuggestion = this.coverageSuggestion(
      row.device?.id
        ? { warrantyStartDate: row.device.warrantyStartDate ?? null, warrantyEndDate: row.device.warrantyEndDate ?? null }
        : null
    );
    return {
      ...row.complaint,
      company: row.company?.id ? row.company : null,
      machine: row.device?.id
        ? {
            id: row.device.id,
            serialNumber: row.inventory?.serialNumber ?? null,
            brand: row.brand?.name ?? null,
            model: row.product?.modelName ?? row.product?.fullName ?? row.product?.modelCode ?? null,
            warrantyStartDate: isoDate(row.device.warrantyStartDate),
            warrantyEndDate: isoDate(row.device.warrantyEndDate),
          }
        : null,
      warrantyStatusSuggestion,
      callAssistant: safeCallAssistantMetadata(row.complaint.metadata),
      attachments: await this.complaintAttachments(row.complaint.id, row.complaint.tenantId),
      serviceTicket: row.ticket?.id ? row.ticket : null,
      link: row.link?.id
        ? (() => {
            const token = complaintLinkToken(row.complaint.tenantId, row.link.id);
            return {
              ...row.link,
              publicPath: this.publicPath(row.link.slug, token),
              qrPublicPath: this.publicPath(row.link.slug, token, 'qr'),
            };
          })()
        : null,
    };
  }

  private async complaintView(id: string, tenantId: string) {
    const [row] = await this.db
      .select({
        complaint: serviceComplaintIntakes,
        company: { id: companies.id, legalTitle: companies.legalTitle, shortName: companies.shortName },
        device: { id: customerDevices.id, warrantyStartDate: customerDevices.warrantyStartDate, warrantyEndDate: customerDevices.warrantyEndDate },
        inventory: { id: inventoryItems.id, serialNumber: inventoryItems.serialNumber },
        product: { id: productModels.id, modelCode: productModels.modelCode, modelName: productModels.modelName, fullName: productModels.fullName },
        brand: { id: brands.id, name: brands.name },
        ticket: { id: serviceTickets.id, ticketNo: serviceTickets.ticketNo, subject: serviceTickets.subject },
        link: { id: serviceComplaintLinks.id, title: serviceComplaintLinks.title, slug: serviceComplaintLinks.slug },
      })
      .from(serviceComplaintIntakes)
      .leftJoin(companies, eq(serviceComplaintIntakes.companyId, companies.id))
      .leftJoin(customerDevices, eq(serviceComplaintIntakes.customerDeviceId, customerDevices.id))
      .leftJoin(inventoryItems, eq(customerDevices.inventoryItemId, inventoryItems.id))
      .leftJoin(productModels, eq(inventoryItems.productModelId, productModels.id))
      .leftJoin(brands, eq(productModels.brandId, brands.id))
      .leftJoin(serviceTickets, eq(serviceComplaintIntakes.serviceTicketId, serviceTickets.id))
      .leftJoin(serviceComplaintLinks, eq(serviceComplaintIntakes.complaintLinkId, serviceComplaintLinks.id))
      .where(and(eq(serviceComplaintIntakes.id, id), eq(serviceComplaintIntakes.tenantId, tenantId), isNull(serviceComplaintIntakes.deletedAt)))
      .limit(1);
    return row ? this.mapComplaintRow(row) : null;
  }

  private async uniqueSlug(tenantId: string, base: string) {
    let slug = slugify(base);
    let suffix = 2;
    while (true) {
      const existing = await this.db.query.serviceComplaintLinks.findFirst({
        where: and(eq(serviceComplaintLinks.tenantId, tenantId), eq(serviceComplaintLinks.slug, slug), isNull(serviceComplaintLinks.deletedAt)),
      });
      if (!existing) return slug;
      slug = `${slugify(base)}-${suffix++}`;
    }
  }

  private async resolveComplaintCompanyDevice(
    tenantId: string,
    companyId?: string | null,
    customerDeviceId?: string | null
  ) {
    let resolvedCompanyId = companyId ?? null;
    if (customerDeviceId) {
      const device = await this.assertDevice(customerDeviceId, tenantId, resolvedCompanyId);
      resolvedCompanyId = resolvedCompanyId ?? device.companyId;
    }
    if (resolvedCompanyId) await this.assertCompany(resolvedCompanyId, tenantId);
    return { companyId: resolvedCompanyId, customerDeviceId: customerDeviceId ?? null };
  }

  @RequirePermissions('service_tickets.read')
  @Get('service-complaints')
  async listComplaints(@Query(new ZodValidationPipe(complaintListQuery)) query: z.infer<typeof complaintListQuery>, @CurrentUser() user: AuthContext) {
    const { limit, offset } = pageOffset(query);
    const filters = [
      eq(serviceComplaintIntakes.tenantId, user.tenantId),
      isNull(serviceComplaintIntakes.deletedAt),
      divisionFilter(resolveActorDivisionScope(user), serviceComplaintIntakes.divisionId) ?? sql`true`,
    ];
    if (query.status) filters.push(eq(serviceComplaintIntakes.status, query.status));
    if (query.source) filters.push(eq(serviceComplaintIntakes.source, query.source));
    if (query.companyId) filters.push(eq(serviceComplaintIntakes.companyId, query.companyId));
    if (query.customerDeviceId) filters.push(eq(serviceComplaintIntakes.customerDeviceId, query.customerDeviceId));
    const where = and(...filters);
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(serviceComplaintIntakes).where(where);
    const rows = await this.db
      .select({
        complaint: serviceComplaintIntakes,
        company: { id: companies.id, legalTitle: companies.legalTitle, shortName: companies.shortName },
        device: { id: customerDevices.id, warrantyStartDate: customerDevices.warrantyStartDate, warrantyEndDate: customerDevices.warrantyEndDate },
        inventory: { id: inventoryItems.id, serialNumber: inventoryItems.serialNumber },
        product: { id: productModels.id, modelCode: productModels.modelCode, modelName: productModels.modelName, fullName: productModels.fullName },
        brand: { id: brands.id, name: brands.name },
        ticket: { id: serviceTickets.id, ticketNo: serviceTickets.ticketNo, subject: serviceTickets.subject },
        link: { id: serviceComplaintLinks.id, title: serviceComplaintLinks.title, slug: serviceComplaintLinks.slug },
      })
      .from(serviceComplaintIntakes)
      .leftJoin(companies, eq(serviceComplaintIntakes.companyId, companies.id))
      .leftJoin(customerDevices, eq(serviceComplaintIntakes.customerDeviceId, customerDevices.id))
      .leftJoin(inventoryItems, eq(customerDevices.inventoryItemId, inventoryItems.id))
      .leftJoin(productModels, eq(inventoryItems.productModelId, productModels.id))
      .leftJoin(brands, eq(productModels.brandId, brands.id))
      .leftJoin(serviceTickets, eq(serviceComplaintIntakes.serviceTicketId, serviceTickets.id))
      .leftJoin(serviceComplaintLinks, eq(serviceComplaintIntakes.complaintLinkId, serviceComplaintLinks.id))
      .where(where)
      .orderBy(desc(serviceComplaintIntakes.createdAt))
      .limit(limit)
      .offset(offset);
    return buildPaginated(await Promise.all(rows.map((row) => this.mapComplaintRow(row))), count, query);
  }

  @RequirePermissions('service_tickets.create')
  @Post('service-complaints')
  async createComplaint(
    @Body(new ZodValidationPipe(serviceComplaintCreateSchema)) body: z.infer<typeof serviceComplaintCreateSchema>,
    @CurrentUser() user: AuthContext
  ) {
    const resolved = await this.resolveComplaintCompanyDevice(user.tenantId, body.companyId, body.customerDeviceId);
    const [row] = await this.db
      .insert(serviceComplaintIntakes)
      .values({
        tenantId: user.tenantId,
        complaintNo: await this.nextComplaintNo(user.tenantId),
        divisionId: resolveAssignedDivision(user, body.divisionId ?? null),
        companyId: resolved.companyId,
        customerDeviceId: resolved.customerDeviceId,
        source: body.source,
        subject: body.subject.trim(),
        description: cleanNullableText(body.description),
        severity: body.severity,
        ticketType: body.ticketType,
        contactName: cleanNullableText(body.contactName),
        contactPhone: cleanNullableText(body.contactPhone),
        contactEmail: cleanNullableText(body.contactEmail),
        createdBy: user.userId,
      })
      .returning();
    await notifyComplaintCreated(this.db, {
      tenantId: row.tenantId,
      divisionId: row.divisionId ?? null,
      complaintId: row.id,
      complaintNo: row.complaintNo,
      subject: row.subject,
      source: row.source,
    });
    return this.complaintView(row.id, user.tenantId);
  }

  @RequirePermissions('service_tickets.update')
  @Patch('service-complaints/:id')
  async updateComplaint(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(serviceComplaintUpdateSchema)) body: z.infer<typeof serviceComplaintUpdateSchema>,
    @CurrentUser() user: AuthContext
  ) {
    const intake = await this.scopedIntake(id, user);
    if (intake.status === 'converted') throw new ValidationError('Servise çevrilen şikayet güncellenemez');
    if (body.status === 'converted') throw new ValidationError('Servise çevirme işlemi convert endpointi ile yapılmalı');
    const patch: Partial<typeof serviceComplaintIntakes.$inferInsert> = {};
    if (body.companyId !== undefined || body.customerDeviceId !== undefined) {
      const resolved = await this.resolveComplaintCompanyDevice(
        user.tenantId,
        body.companyId !== undefined ? body.companyId : intake.companyId,
        body.customerDeviceId !== undefined ? body.customerDeviceId : intake.customerDeviceId
      );
      patch.companyId = resolved.companyId;
      patch.customerDeviceId = resolved.customerDeviceId;
    }
    if (body.status !== undefined) patch.status = body.status;
    if (body.source !== undefined) patch.source = body.source;
    if (body.subject !== undefined) patch.subject = body.subject.trim();
    if (body.description !== undefined) patch.description = cleanNullableText(body.description);
    if (body.severity !== undefined) patch.severity = body.severity;
    if (body.ticketType !== undefined) patch.ticketType = body.ticketType;
    if (body.contactName !== undefined) patch.contactName = cleanNullableText(body.contactName);
    if (body.contactPhone !== undefined) patch.contactPhone = cleanNullableText(body.contactPhone);
    if (body.contactEmail !== undefined) patch.contactEmail = cleanNullableText(body.contactEmail);
    if (Object.keys(patch).length) {
      await this.db.update(serviceComplaintIntakes).set(patch).where(eq(serviceComplaintIntakes.id, intake.id));
    }
    return this.complaintView(intake.id, user.tenantId);
  }

  @RequirePermissions('service_tickets.create')
  @Post('service-complaints/:id/convert')
  async convertComplaint(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(serviceComplaintConvertSchema)) body: z.infer<typeof serviceComplaintConvertSchema>,
    @CurrentUser() user: AuthContext
  ) {
    const intake = await this.scopedIntake(id, user);
    if (intake.status === 'converted') throw new ValidationError('Şikayet zaten servis talebine çevrilmiş');
    if (intake.status === 'rejected') throw new ValidationError('Reddedilen şikayet servise çevrilemez');
    if (!intake.companyId) throw new ValidationError('Servis talebi açmak için firma eşleştirilmelidir');
    if (body.assignedToUserId) await this.assertAssignedUser(body.assignedToUserId, user.tenantId);
    const openStatus = await this.db.query.serviceTicketStatuses.findFirst({ where: eq(serviceTicketStatuses.code, 'open') });
    const [ticket] = await this.db
      .insert(serviceTickets)
      .values({
        tenantId: user.tenantId,
        ticketNo: await this.nextServiceTicketNo(user.tenantId),
        divisionId: intake.divisionId ?? resolveAssignedDivision(user, null),
        companyId: intake.companyId,
        customerDeviceId: intake.customerDeviceId ?? null,
        subject: intake.subject,
        description: intake.description,
        severity: intake.severity,
        ticketType: intake.ticketType,
        source: intake.source,
        statusId: openStatus?.id ?? null,
        assignedToUserId: body.assignedToUserId ?? null,
        metadata: {
          complaintIntakeId: intake.id,
          complaintNo: intake.complaintNo,
          contactName: intake.contactName,
          contactPhone: intake.contactPhone,
          contactEmail: intake.contactEmail,
        },
      })
      .returning();
    if (ticket.ticketType === 'warranty_claim') {
      await this.ensureWarrantyClaim(ticket);
    }
    await this.copyComplaintFilesToTicket(intake.id, ticket.id, user.tenantId);
    await this.db
      .update(serviceComplaintIntakes)
      .set({ status: 'converted', serviceTicketId: ticket.id })
      .where(eq(serviceComplaintIntakes.id, intake.id));
    return this.complaintView(intake.id, user.tenantId);
  }

  @RequirePermissions('service_tickets.update')
  @Post('service-complaints/:id/reject')
  async rejectComplaint(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(serviceComplaintRejectSchema)) body: z.infer<typeof serviceComplaintRejectSchema>,
    @CurrentUser() user: AuthContext
  ) {
    const intake = await this.scopedIntake(id, user);
    if (intake.status === 'converted') throw new ValidationError('Servise çevrilen şikayet reddedilemez');
    await this.db
      .update(serviceComplaintIntakes)
      .set({ status: 'rejected', rejectionNote: cleanNullableText(body.rejectionNote) })
      .where(eq(serviceComplaintIntakes.id, intake.id));
    return this.complaintView(intake.id, user.tenantId);
  }

  @RequirePermissions('service_tickets.read')
  @Get('service-complaint-links')
  async listLinks(@Query(new ZodValidationPipe(complaintLinkListQuery)) query: z.infer<typeof complaintLinkListQuery>, @CurrentUser() user: AuthContext) {
    const { limit, offset } = pageOffset(query);
    const filters = [
      eq(serviceComplaintLinks.tenantId, user.tenantId),
      isNull(serviceComplaintLinks.deletedAt),
      divisionFilter(resolveActorDivisionScope(user), serviceComplaintLinks.divisionId) ?? sql`true`,
    ];
    if (query.companyId) filters.push(eq(serviceComplaintLinks.companyId, query.companyId));
    if (query.customerDeviceId) filters.push(eq(serviceComplaintLinks.customerDeviceId, query.customerDeviceId));
    const where = and(...filters);
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(serviceComplaintLinks).where(where);
    const rows = await this.db
      .select({
        link: serviceComplaintLinks,
        company: { id: companies.id, legalTitle: companies.legalTitle, shortName: companies.shortName },
        device: { id: customerDevices.id },
        inventory: { id: inventoryItems.id, serialNumber: inventoryItems.serialNumber },
        product: { id: productModels.id, modelCode: productModels.modelCode, modelName: productModels.modelName, fullName: productModels.fullName },
        brand: { id: brands.id, name: brands.name },
      })
      .from(serviceComplaintLinks)
      .leftJoin(companies, eq(serviceComplaintLinks.companyId, companies.id))
      .leftJoin(customerDevices, eq(serviceComplaintLinks.customerDeviceId, customerDevices.id))
      .leftJoin(inventoryItems, eq(customerDevices.inventoryItemId, inventoryItems.id))
      .leftJoin(productModels, eq(inventoryItems.productModelId, productModels.id))
      .leftJoin(brands, eq(productModels.brandId, brands.id))
      .where(where)
      .orderBy(desc(serviceComplaintLinks.createdAt))
      .limit(limit)
      .offset(offset);
    return buildPaginated(
      rows.map((row) => ({
        ...row.link,
        publicPath: this.publicPath(row.link.slug, complaintLinkToken(row.link.tenantId, row.link.id)),
        qrPublicPath: this.publicPath(row.link.slug, complaintLinkToken(row.link.tenantId, row.link.id), 'qr'),
        company: row.company?.id ? row.company : null,
        machine: row.device?.id
          ? {
              id: row.device.id,
              serialNumber: row.inventory?.serialNumber ?? null,
              brand: row.brand?.name ?? null,
              model: row.product?.modelName ?? row.product?.fullName ?? row.product?.modelCode ?? null,
            }
          : null,
      })),
      count,
      query
    );
  }

  @RequirePermissions('service_tickets.create')
  @Post('service-complaint-links')
  async createLink(
    @Body(new ZodValidationPipe(serviceComplaintLinkCreateSchema)) body: z.infer<typeof serviceComplaintLinkCreateSchema>,
    @CurrentUser() user: AuthContext
  ) {
    const resolved = await this.resolveComplaintCompanyDevice(user.tenantId, body.companyId, body.customerDeviceId);
    const company = resolved.companyId ? await this.assertCompany(resolved.companyId, user.tenantId) : null;
    const title = cleanNullableText(body.title) ?? (company?.shortName || company?.legalTitle ? `${company?.shortName ?? company?.legalTitle} Şikayet Formu` : 'Servis Şikayet Formu');
    const slug = await this.uniqueSlug(user.tenantId, title);
    const linkId = randomUUID();
    const token = complaintLinkToken(user.tenantId, linkId);
    const [link] = await this.db
      .insert(serviceComplaintLinks)
      .values({
        id: linkId,
        tenantId: user.tenantId,
        divisionId: resolveAssignedDivision(user, body.divisionId ?? null),
        companyId: resolved.companyId,
        customerDeviceId: resolved.customerDeviceId,
        slug,
        accessTokenHash: tokenHash(token),
        title,
        notes: cleanNullableText(body.notes),
        createdBy: user.userId,
      })
      .returning();
    return { ...link, token, publicPath: this.publicPath(link.slug, token), qrPublicPath: this.publicPath(link.slug, token, 'qr') };
  }

  @RequirePermissions('service_tickets.update')
  @Patch('service-complaint-links/:id/revoke')
  async revokeLink(@Param('id') id: string, @CurrentUser() user: AuthContext) {
    const link = await this.db.query.serviceComplaintLinks.findFirst({
      where: and(
        eq(serviceComplaintLinks.id, id),
        eq(serviceComplaintLinks.tenantId, user.tenantId),
        isNull(serviceComplaintLinks.deletedAt),
        divisionFilter(resolveActorDivisionScope(user), serviceComplaintLinks.divisionId) ?? sql`true`
      ),
    });
    if (!link) throw new NotFoundError('Şikayet linki');
    const [row] = await this.db
      .update(serviceComplaintLinks)
      .set({ isActive: false, revokedAt: new Date() })
      .where(eq(serviceComplaintLinks.id, link.id))
      .returning();
    return row;
  }
}

@Controller('public/service-complaints')
export class PublicServiceComplaintsController {
  private env = loadEnv();

  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly storage: StorageService
  ) {}

  private async publicLink(slug: string, token: string) {
    const link = await this.db.query.serviceComplaintLinks.findFirst({
      where: and(
        eq(serviceComplaintLinks.slug, slug),
        eq(serviceComplaintLinks.isActive, true),
        isNull(serviceComplaintLinks.revokedAt),
        isNull(serviceComplaintLinks.deletedAt)
      ),
    });
    if (!link || !validComplaintLinkToken(link, token)) throw new NotFoundError('Şikayet formu');
    return link;
  }

  private async nextComplaintNo(tenantId: string) {
    const [{ c }] = await this.db.select({ c: sql<number>`count(*)::int` }).from(serviceComplaintIntakes).where(eq(serviceComplaintIntakes.tenantId, tenantId));
    const year = new Date().getUTCFullYear();
    return `CMP-${year}-${String(c + 1).padStart(4, '0')}`;
  }

  private coverageSuggestion(device?: { warrantyStartDate: Date | null; warrantyEndDate: Date | null } | null) {
    if (!device?.warrantyEndDate) return 'unknown';
    const now = Date.now();
    const start = device.warrantyStartDate?.getTime();
    const end = device.warrantyEndDate.getTime();
    if (start && start > now) return 'unknown';
    return end >= now ? 'in_warranty' : 'out_of_warranty';
  }

  private async complaintEvidenceDocumentTypeId() {
    const docType = await this.db.query.fileDocumentTypes.findFirst({
      where: eq(fileDocumentTypes.code, 'service_complaint_evidence'),
    });
    if (!docType) throw new ValidationError('service_complaint_evidence doküman tipi bulunamadı');
    return docType.id;
  }

  private async linkAttachmentFileIds(complaintId: string, tenantId: string, fileIds?: string[]) {
    if (!fileIds?.length) return;
    const uniqueIds = [...new Set(fileIds)];
    const validFiles = await this.db
      .select({ id: files.id })
      .from(files)
      .where(and(eq(files.tenantId, tenantId), inArray(files.id, uniqueIds), isNull(files.deletedAt)));
    if (validFiles.length !== uniqueIds.length) throw new ValidationError('Geçersiz şikayet kanıt dosyası');
    const documentTypeId = await this.complaintEvidenceDocumentTypeId();
    await this.db.insert(fileLinks).values(
      uniqueIds.map((fileId) => ({
        tenantId,
        fileId,
        entityType: 'service_complaint_intake',
        entityId: complaintId,
        documentTypeId,
      }))
    );
  }

  private async publicContext(link: ComplaintLink) {
    const company = link.companyId
      ? await this.db.query.companies.findFirst({
          where: and(eq(companies.id, link.companyId), eq(companies.tenantId, link.tenantId), isNull(companies.deletedAt)),
        })
      : null;
    const machine = link.customerDeviceId
      ? await this.db
          .select({
            device: customerDevices,
            inventory: { serialNumber: inventoryItems.serialNumber },
            product: { modelCode: productModels.modelCode, modelName: productModels.modelName, fullName: productModels.fullName },
            brand: { name: brands.name },
          })
          .from(customerDevices)
          .leftJoin(inventoryItems, eq(customerDevices.inventoryItemId, inventoryItems.id))
          .leftJoin(productModels, eq(inventoryItems.productModelId, productModels.id))
          .leftJoin(brands, eq(productModels.brandId, brands.id))
          .where(and(eq(customerDevices.id, link.customerDeviceId), eq(customerDevices.tenantId, link.tenantId), isNull(customerDevices.deletedAt)))
          .limit(1)
      : [];
    const row = machine[0];
    return {
      link: { id: link.id, title: link.title, notes: link.notes },
      company: company ? { id: company.id, name: company.shortName ?? company.legalTitle } : null,
      machine: row
        ? {
            id: row.device.id,
            brand: row.brand?.name ?? null,
            model: row.product?.modelName ?? row.product?.fullName ?? row.product?.modelCode ?? null,
            serialNumber: row.inventory?.serialNumber ?? null,
            warrantyStartDate: isoDate(row.device.warrantyStartDate),
            warrantyEndDate: isoDate(row.device.warrantyEndDate),
            warrantyStatusSuggestion: this.coverageSuggestion(row.device),
          }
        : null,
    };
  }

  @Get(':slug/:token')
  async getPublicComplaintForm(@Param('slug') slug: string, @Param('token') token: string) {
    const link = await this.publicLink(slug, token);
    return this.publicContext(link);
  }

  @Post(':slug/:token/files/signed-upload-url')
  async createPublicSignedUploadUrl(
    @Param('slug') slug: string,
    @Param('token') token: string,
    @Body(new ZodValidationPipe(publicComplaintUploadSchema)) body: z.infer<typeof publicComplaintUploadSchema>
  ) {
    const link = await this.publicLink(slug, token);
    this.storage.validateUploadIntent({
      filename: body.filename,
      mimeType: body.mimeType,
      extension: body.extension,
      sizeBytes: body.sizeBytes,
    });
    const objectKey = this.storage.buildKey({
      tenantId: link.tenantId,
      entityType: 'service_complaint_intake',
      entityId: link.id,
      filename: body.filename,
    });
    const uploadUrl = await this.storage.getSignedUploadUrl({
      bucket: body.bucket,
      objectKey,
      mimeType: body.mimeType,
      contentLength: body.sizeBytes,
    });
    const provider = await this.db.query.storageProviders.findFirst({
      where: eq(storageProviders.code, this.env.S3_PROVIDER),
    });
    const [file] = await this.db
      .insert(files)
      .values({
        tenantId: link.tenantId,
        bucket: body.bucket,
        objectKey,
        originalFilename: body.filename,
        mimeType: body.mimeType,
        extension: body.extension,
        sizeBytes: body.sizeBytes,
        storageProviderId: provider?.id ?? null,
        visibility: 'private',
        uploadedBy: null,
      })
      .returning();
    return {
      fileId: file.id,
      bucket: body.bucket,
      objectKey,
      uploadUrl,
      expiresInSeconds: this.env.SIGNED_URL_EXPIRE_SECONDS,
    };
  }

  @Post(':slug/:token')
  async createPublicComplaint(
    @Param('slug') slug: string,
    @Param('token') token: string,
    @Body(new ZodValidationPipe(publicServiceComplaintSchema)) body: z.infer<typeof publicServiceComplaintSchema>
  ) {
    const link = await this.publicLink(slug, token);
    const [row] = await this.db
      .insert(serviceComplaintIntakes)
      .values({
        tenantId: link.tenantId,
        complaintNo: await this.nextComplaintNo(link.tenantId),
        divisionId: link.divisionId ?? null,
        complaintLinkId: link.id,
        companyId: link.companyId ?? null,
        customerDeviceId: link.customerDeviceId ?? null,
        source: body.source,
        subject: body.subject.trim(),
        description: cleanNullableText(body.description),
        severity: body.severity,
        ticketType: body.ticketType,
        contactName: cleanNullableText(body.contactName),
        contactPhone: cleanNullableText(body.contactPhone),
        contactEmail: cleanNullableText(body.contactEmail),
      })
      .returning();
    await this.linkAttachmentFileIds(row.id, link.tenantId, body.attachmentFileIds);
    await notifyComplaintCreated(this.db, {
      tenantId: row.tenantId,
      divisionId: row.divisionId ?? null,
      complaintId: row.id,
      complaintNo: row.complaintNo,
      subject: row.subject,
      source: row.source,
    });
    return { id: row.id, complaintNo: row.complaintNo, status: row.status };
  }
}
