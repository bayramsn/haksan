import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import {
  brands,
  companies,
  companyAddresses,
  currencies,
  customerDevices,
  files,
  inventoryItems,
  inventoryStatuses,
  machineMaintenanceEvents,
  machinePassportDocuments,
  machinePassports,
  productConfigurationRules,
  productEquipmentItems,
  productModels,
  productOptionSets,
  productOptionValues,
  quoteConfigurationSnapshots,
  serviceTickets,
  serviceTicketStatuses,
  warrantyStatuses,
} from '../../db/schema';
import { DB } from '../../shared/database/database.module';
import type { AuthContext } from '../../shared/security/auth.types';
import { NotFoundError, ValidationError } from '../../shared/utils/errors';
import { lookupIdByCode } from '../../shared/utils/lookup.helper';
import { QuotesService } from '../quotes/quotes.service';

type PassportPublishInput = {
  publicTitle?: string;
  publicNotes?: string;
};

type CpqPreviewInput = {
  companyId?: string;
  productModelId: string;
  inventoryItemId?: string;
  selectedOptionValueIds?: string[];
  includeInstallation?: boolean;
  includeLogistics?: boolean;
  currencyCode?: string;
};

type CpqCreateQuoteInput = CpqPreviewInput & {
  companyId: string;
  contactId?: string;
  validityDays?: number;
  paymentTerms?: string;
  deliveryTerms?: string;
  warrantyTerms?: string;
  notes?: string;
};

type PublicTicketInput = {
  subject: string;
  description?: string;
  severity?: string;
};

type CpqLine = {
  kind: 'product' | 'option' | 'service' | 'logistics';
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  productModelId?: string;
  inventoryItemId?: string;
  optionValueId?: string;
};

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
  return normalized || `makine-${randomBytes(4).toString('hex')}`;
}

function toNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function isoDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

@Injectable()
export class LifecycleService {
  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly quotesService: QuotesService
  ) {}

  private async assertDevice(deviceId: string, tenantId: string) {
    const device = await this.db.query.customerDevices.findFirst({
      where: and(eq(customerDevices.id, deviceId), eq(customerDevices.tenantId, tenantId), isNull(customerDevices.deletedAt)),
    });
    if (!device) throw new NotFoundError('Makine');
    return device;
  }

  private async nextServiceTicketNo(tenantId: string): Promise<string> {
    const [{ c }] = await this.db.select({ c: sql<number>`count(*)::int` }).from(serviceTickets).where(eq(serviceTickets.tenantId, tenantId));
    const year = new Date().getUTCFullYear();
    return `SVC-${year}-${String(c + 1).padStart(4, '0')}`;
  }

  private async uniqueSlug(tenantId: string, base: string, currentPassportId?: string | null): Promise<string> {
    let slug = slugify(base);
    let suffix = 2;
    while (true) {
      const existing = await this.db.query.machinePassports.findFirst({
        where: and(eq(machinePassports.tenantId, tenantId), eq(machinePassports.slug, slug), isNull(machinePassports.deletedAt)),
      });
      if (!existing || existing.id === currentPassportId) return slug;
      slug = `${slugify(base)}-${suffix}`;
      suffix += 1;
    }
  }

  private publicPath(slug: string, token: string): string {
    return `/p/${encodeURIComponent(slug)}/${encodeURIComponent(token)}`;
  }

  async listPassports(actor: AuthContext) {
    const rows = await this.db
      .select({
        device: customerDevices,
        passport: machinePassports,
        company: { id: companies.id, legalTitle: companies.legalTitle, shortName: companies.shortName },
        address: {
          province: companyAddresses.province,
          district: companyAddresses.district,
          locality: companyAddresses.locality,
          fullAddress: companyAddresses.fullAddress,
        },
        inventory: {
          id: inventoryItems.id,
          serialNumber: inventoryItems.serialNumber,
          controlUnit: inventoryItems.controlUnit,
          controlUnitSerialNumber: inventoryItems.controlUnitSerialNumber,
        },
        product: { id: productModels.id, modelCode: productModels.modelCode, modelName: productModels.modelName, fullName: productModels.fullName },
        brand: { id: brands.id, name: brands.name },
        warrantyStatus: { code: warrantyStatuses.code, name: warrantyStatuses.name },
      })
      .from(customerDevices)
      .leftJoin(machinePassports, and(eq(machinePassports.customerDeviceId, customerDevices.id), isNull(machinePassports.deletedAt)))
      .leftJoin(companies, eq(customerDevices.companyId, companies.id))
      .leftJoin(companyAddresses, and(eq(companyAddresses.companyId, companies.id), eq(companyAddresses.isDefault, true)))
      .leftJoin(inventoryItems, eq(customerDevices.inventoryItemId, inventoryItems.id))
      .leftJoin(productModels, eq(inventoryItems.productModelId, productModels.id))
      .leftJoin(brands, eq(productModels.brandId, brands.id))
      .leftJoin(warrantyStatuses, eq(customerDevices.statusId, warrantyStatuses.id))
      .where(and(eq(customerDevices.tenantId, actor.tenantId), isNull(customerDevices.deletedAt)))
      .orderBy(desc(customerDevices.installationDate), desc(customerDevices.createdAt));

    return rows.map((r) => ({
      id: r.device.id,
      company: r.company,
      address: r.address,
      product: r.product,
      brand: r.brand,
      serialNumber: r.inventory?.serialNumber ?? null,
      controlUnit: r.inventory?.controlUnit ?? null,
      controlUnitSerialNumber: r.inventory?.controlUnitSerialNumber ?? null,
      saleDate: isoDate(r.device.saleDate),
      deliveryDate: isoDate(r.device.deliveryDate),
      installationDate: isoDate(r.device.installationDate),
      warrantyStartDate: isoDate(r.device.warrantyStartDate),
      warrantyEndDate: isoDate(r.device.warrantyEndDate),
      warrantyStatus: r.warrantyStatus,
      passport: r.passport
        ? {
            id: r.passport.id,
            slug: r.passport.slug,
            publicTitle: r.passport.publicTitle,
            publicNotes: r.passport.publicNotes,
            publishedAt: isoDate(r.passport.publishedAt),
            revokedAt: isoDate(r.passport.revokedAt),
            tokenRotatedAt: isoDate(r.passport.tokenRotatedAt),
            lastViewedAt: isoDate(r.passport.lastViewedAt),
          }
        : null,
    }));
  }

  async publishPassport(deviceId: string, input: PassportPublishInput, actor: AuthContext) {
    const device = await this.assertDevice(deviceId, actor.tenantId);
    const existing = await this.db.query.machinePassports.findFirst({
      where: and(eq(machinePassports.customerDeviceId, deviceId), eq(machinePassports.tenantId, actor.tenantId), isNull(machinePassports.deletedAt)),
    });
    const inventory = device.inventoryItemId
      ? await this.db.query.inventoryItems.findFirst({ where: eq(inventoryItems.id, device.inventoryItemId) })
      : null;
    const product = inventory?.productModelId
      ? await this.db.query.productModels.findFirst({ where: eq(productModels.id, inventory.productModelId) })
      : null;
    const baseSlug = [product?.modelCode ?? product?.modelName ?? 'cnc', inventory?.serialNumber ?? device.id.slice(0, 8)].join('-');
    const slug = await this.uniqueSlug(actor.tenantId, existing?.slug ?? baseSlug, existing?.id);
    const token = randomBytes(32).toString('base64url');
    const now = new Date();

    const payload = {
      accessTokenHash: tokenHash(token),
      slug,
      publicTitle: input.publicTitle?.trim() || product?.fullName || inventory?.serialNumber || 'Makine Pasaportu',
      publicNotes: input.publicNotes?.trim() || null,
      publishedAt: existing?.publishedAt ?? now,
      revokedAt: null,
      tokenRotatedAt: now,
      updatedAt: now,
    };

    const [passport] = existing
      ? await this.db.update(machinePassports).set(payload).where(eq(machinePassports.id, existing.id)).returning()
      : await this.db
          .insert(machinePassports)
          .values({
            tenantId: actor.tenantId,
            customerDeviceId: deviceId,
            createdBy: actor.userId,
            ...payload,
          })
          .returning();

    return {
      passport: {
        id: passport.id,
        slug: passport.slug,
        publicTitle: passport.publicTitle,
        publicNotes: passport.publicNotes,
        publishedAt: isoDate(passport.publishedAt),
        revokedAt: isoDate(passport.revokedAt),
        tokenRotatedAt: isoDate(passport.tokenRotatedAt),
      },
      token,
      publicPath: this.publicPath(passport.slug, token),
    };
  }

  async rotatePassport(passportId: string, actor: AuthContext) {
    const passport = await this.db.query.machinePassports.findFirst({
      where: and(eq(machinePassports.id, passportId), eq(machinePassports.tenantId, actor.tenantId), isNull(machinePassports.deletedAt)),
    });
    if (!passport) throw new NotFoundError('Pasaport');
    const token = randomBytes(32).toString('base64url');
    const [row] = await this.db
      .update(machinePassports)
      .set({ accessTokenHash: tokenHash(token), tokenRotatedAt: new Date(), revokedAt: null, updatedAt: new Date() })
      .where(eq(machinePassports.id, passport.id))
      .returning();
    return { passport: row, token, publicPath: this.publicPath(row.slug, token) };
  }

  async revokePassport(passportId: string, actor: AuthContext) {
    const passport = await this.db.query.machinePassports.findFirst({
      where: and(eq(machinePassports.id, passportId), eq(machinePassports.tenantId, actor.tenantId), isNull(machinePassports.deletedAt)),
    });
    if (!passport) throw new NotFoundError('Pasaport');
    await this.db.update(machinePassports).set({ revokedAt: new Date(), updatedAt: new Date() }).where(eq(machinePassports.id, passport.id));
    return { ok: true };
  }

  private async getPublicPassportRow(slug: string, token: string) {
    const [row] = await this.db
      .select({
        passport: machinePassports,
        device: customerDevices,
        company: { id: companies.id, legalTitle: companies.legalTitle, shortName: companies.shortName },
        address: {
          province: companyAddresses.province,
          district: companyAddresses.district,
          locality: companyAddresses.locality,
          fullAddress: companyAddresses.fullAddress,
        },
        inventory: {
          id: inventoryItems.id,
          serialNumber: inventoryItems.serialNumber,
          controlUnit: inventoryItems.controlUnit,
          controlUnitSerialNumber: inventoryItems.controlUnitSerialNumber,
        },
        product: { id: productModels.id, modelCode: productModels.modelCode, modelName: productModels.modelName, fullName: productModels.fullName },
        brand: { id: brands.id, name: brands.name },
        warrantyStatus: { code: warrantyStatuses.code, name: warrantyStatuses.name },
      })
      .from(machinePassports)
      .innerJoin(customerDevices, eq(machinePassports.customerDeviceId, customerDevices.id))
      .leftJoin(companies, eq(customerDevices.companyId, companies.id))
      .leftJoin(companyAddresses, and(eq(companyAddresses.companyId, companies.id), eq(companyAddresses.isDefault, true)))
      .leftJoin(inventoryItems, eq(customerDevices.inventoryItemId, inventoryItems.id))
      .leftJoin(productModels, eq(inventoryItems.productModelId, productModels.id))
      .leftJoin(brands, eq(productModels.brandId, brands.id))
      .leftJoin(warrantyStatuses, eq(customerDevices.statusId, warrantyStatuses.id))
      .where(
        and(
          eq(machinePassports.slug, slug),
          eq(machinePassports.accessTokenHash, tokenHash(token)),
          isNull(machinePassports.deletedAt),
          isNull(machinePassports.revokedAt),
          isNotNull(machinePassports.publishedAt),
          isNull(customerDevices.deletedAt)
        )
      )
      .limit(1);
    if (!row) throw new NotFoundError('Pasaport');
    return row;
  }

  async getPublicPassport(slug: string, token: string) {
    const row = await this.getPublicPassportRow(slug, token);
    await this.db.update(machinePassports).set({ lastViewedAt: new Date() }).where(eq(machinePassports.id, row.passport.id));

    const events = await this.db
      .select({
        id: machineMaintenanceEvents.id,
        eventType: machineMaintenanceEvents.eventType,
        eventDate: machineMaintenanceEvents.eventDate,
        title: machineMaintenanceEvents.title,
        notes: machineMaintenanceEvents.notes,
        nextDueDate: machineMaintenanceEvents.nextDueDate,
      })
      .from(machineMaintenanceEvents)
      .where(
        and(
          eq(machineMaintenanceEvents.tenantId, row.passport.tenantId),
          eq(machineMaintenanceEvents.customerDeviceId, row.device.id),
          isNull(machineMaintenanceEvents.deletedAt)
        )
      )
      .orderBy(desc(machineMaintenanceEvents.eventDate))
      .limit(25);

    const tickets = await this.db
      .select({
        id: serviceTickets.id,
        ticketNo: serviceTickets.ticketNo,
        subject: serviceTickets.subject,
        severity: serviceTickets.severity,
        reportedAt: serviceTickets.reportedAt,
        resolvedAt: serviceTickets.resolvedAt,
        status: { code: serviceTicketStatuses.code, name: serviceTicketStatuses.name },
      })
      .from(serviceTickets)
      .leftJoin(serviceTicketStatuses, eq(serviceTickets.statusId, serviceTicketStatuses.id))
      .where(and(eq(serviceTickets.tenantId, row.passport.tenantId), eq(serviceTickets.customerDeviceId, row.device.id), isNull(serviceTickets.deletedAt)))
      .orderBy(desc(serviceTickets.reportedAt))
      .limit(15);

    const documents = await this.db
      .select({
        id: machinePassportDocuments.id,
        title: machinePassportDocuments.title,
        documentType: machinePassportDocuments.documentType,
        filename: files.originalFilename,
        mimeType: files.mimeType,
      })
      .from(machinePassportDocuments)
      .leftJoin(files, eq(machinePassportDocuments.fileId, files.id))
      .where(
        and(
          eq(machinePassportDocuments.tenantId, row.passport.tenantId),
          eq(machinePassportDocuments.passportId, row.passport.id),
          eq(machinePassportDocuments.visibility, 'public'),
          isNull(machinePassportDocuments.deletedAt)
        )
      )
      .orderBy(asc(machinePassportDocuments.sortOrder), asc(machinePassportDocuments.title));

    return {
      passport: {
        id: row.passport.id,
        slug: row.passport.slug,
        title: row.passport.publicTitle,
        notes: row.passport.publicNotes,
        publishedAt: isoDate(row.passport.publishedAt),
      },
      company: row.company,
      address: row.address,
      machine: {
        id: row.device.id,
        brand: row.brand?.name ?? null,
        modelCode: row.product?.modelCode ?? null,
        modelName: row.product?.modelName ?? row.product?.fullName ?? null,
        serialNumber: row.inventory?.serialNumber ?? null,
        controlUnit: row.inventory?.controlUnit ?? null,
        controlUnitSerialNumber: row.inventory?.controlUnitSerialNumber ?? null,
        deliveryDate: isoDate(row.device.deliveryDate),
        installationDate: isoDate(row.device.installationDate),
        warrantyStartDate: isoDate(row.device.warrantyStartDate),
        warrantyEndDate: isoDate(row.device.warrantyEndDate),
        warrantyStatus: row.warrantyStatus,
      },
      maintenanceEvents: events.map((event) => ({
        ...event,
        eventDate: isoDate(event.eventDate),
        nextDueDate: isoDate(event.nextDueDate),
      })),
      serviceTickets: tickets.map((ticket) => ({
        ...ticket,
        reportedAt: isoDate(ticket.reportedAt),
        resolvedAt: isoDate(ticket.resolvedAt),
      })),
      documents,
      sparePartRecommendations: this.sparePartRecommendations(row.product?.modelName ?? row.product?.fullName ?? ''),
    };
  }

  async createPublicServiceTicket(slug: string, token: string, input: PublicTicketInput) {
    const row = await this.getPublicPassportRow(slug, token);
    const openStatusId = await lookupIdByCode(this.db, serviceTicketStatuses, 'open');
    const [ticket] = await this.db
      .insert(serviceTickets)
      .values({
        tenantId: row.passport.tenantId,
        ticketNo: await this.nextServiceTicketNo(row.passport.tenantId),
        companyId: row.device.companyId,
        contactId: row.device.contactId ?? null,
        customerDeviceId: row.device.id,
        subject: input.subject.trim(),
        description: input.description?.trim() || null,
        severity: input.severity ?? 'normal',
        // Müşteri, makine pasaportu (QR) üzerinden açtı → kanal kaydı.
        source: 'passport',
        statusId: openStatusId,
      })
      .returning();

    await this.db.insert(machineMaintenanceEvents).values({
      tenantId: row.passport.tenantId,
      customerDeviceId: row.device.id,
      serviceTicketId: ticket.id,
      eventType: 'service_request',
      title: `Servis talebi açıldı: ${ticket.subject}`,
      notes: ticket.description,
    });

    return { ticketNo: ticket.ticketNo, subject: ticket.subject, reportedAt: isoDate(ticket.reportedAt) };
  }

  private sparePartRecommendations(modelText: string) {
    const text = modelText.toLocaleLowerCase('tr-TR');
    const base = ['Filtre seti', 'Yağlama sarf seti', 'Koruyucu cam / siperlik kontrolü'];
    if (text.includes('torna')) return [...base, 'Ayna bakım seti', 'Takım tutucu kontrol listesi'];
    if (text.includes('işleme') || text.includes('isleme') || text.includes('vmc')) return [...base, 'Spindle bakım kiti', 'Soğutma sıvısı bakım seti'];
    return base;
  }

  async cpqPreview(input: CpqPreviewInput, actor: AuthContext) {
    const [productRow] = await this.db
      .select({
        product: productModels,
        brand: { id: brands.id, name: brands.name },
        currency: { code: currencies.code },
      })
      .from(productModels)
      .leftJoin(brands, eq(productModels.brandId, brands.id))
      .leftJoin(currencies, eq(productModels.currencyId, currencies.id))
      .where(and(eq(productModels.id, input.productModelId), eq(productModels.tenantId, actor.tenantId), isNull(productModels.deletedAt)))
      .limit(1);
    if (!productRow) throw new NotFoundError('Ürün modeli');

    const optionRows = await this.db
      .select({
        set: productOptionSets,
        value: productOptionValues,
        currency: { code: currencies.code },
      })
      .from(productOptionSets)
      .leftJoin(productOptionValues, and(eq(productOptionValues.optionSetId, productOptionSets.id), isNull(productOptionValues.deletedAt)))
      .leftJoin(currencies, eq(productOptionValues.currencyId, currencies.id))
      .where(and(eq(productOptionSets.productModelId, input.productModelId), eq(productOptionSets.tenantId, actor.tenantId), isNull(productOptionSets.deletedAt)))
      .orderBy(asc(productOptionSets.sortOrder), asc(productOptionValues.sortOrder));

    const optionSets = new Map<string, any>();
    const optionLabels = new Map<string, string>();
    const optionPrices = new Map<string, number>();
    for (const row of optionRows) {
      if (!optionSets.has(row.set.id)) optionSets.set(row.set.id, { id: row.set.id, name: row.set.name, values: [] });
      if (row.value) {
        const value = {
          id: row.value.id,
          value: row.value.value,
          priceDelta: toNumber(row.value.priceDelta),
          currencyCode: row.currency?.code ?? productRow.currency?.code ?? 'USD',
        };
        optionSets.get(row.set.id).values.push(value);
        optionLabels.set(row.value.id, `${row.set.name}: ${row.value.value}`);
        optionPrices.set(row.value.id, value.priceDelta);
      }
    }

    const selectedOptionIds = Array.from(new Set(input.selectedOptionValueIds ?? []));
    const selectedOptions = selectedOptionIds
      .map((id) => ({ id, label: optionLabels.get(id), priceDelta: optionPrices.get(id) ?? 0 }))
      .filter((item) => item.label);

    const inventoryRows = await this.db
      .select({
        item: inventoryItems,
        status: { code: inventoryStatuses.code, name: inventoryStatuses.name },
      })
      .from(inventoryItems)
      .leftJoin(inventoryStatuses, eq(inventoryItems.stockStatusId, inventoryStatuses.id))
      .where(and(eq(inventoryItems.productModelId, input.productModelId), eq(inventoryItems.tenantId, actor.tenantId), isNull(inventoryItems.deletedAt)))
      .orderBy(desc(inventoryItems.arrivalDate), asc(inventoryItems.serialNumber));

    if (input.inventoryItemId && !inventoryRows.some((row) => row.item.id === input.inventoryItemId)) {
      throw new ValidationError('Seçilen seri numarası bu ürün modeliyle uyumlu değil');
    }

    const equipment = await this.db
      .select({
        id: productEquipmentItems.id,
        title: productEquipmentItems.title,
        description: productEquipmentItems.description,
        unitPrice: productEquipmentItems.unitPrice,
        isPromotion: productEquipmentItems.isPromotion,
      })
      .from(productEquipmentItems)
      .where(and(eq(productEquipmentItems.productModelId, input.productModelId), eq(productEquipmentItems.tenantId, actor.tenantId), isNull(productEquipmentItems.deletedAt)))
      .orderBy(asc(productEquipmentItems.sortOrder));

    const rules = await this.db
      .select()
      .from(productConfigurationRules)
      .where(
        and(
          eq(productConfigurationRules.productModelId, input.productModelId),
          eq(productConfigurationRules.tenantId, actor.tenantId),
          eq(productConfigurationRules.isActive, true),
          isNull(productConfigurationRules.deletedAt)
        )
      );
    const selected = new Set(selectedOptionIds);
    const warnings = rules.flatMap((rule) => this.evaluateRule(rule, selected, optionLabels)).filter(Boolean);

    const currencyCode = input.currencyCode ?? productRow.currency?.code ?? 'USD';
    const basePrice = toNumber(productRow.product.cashPrice ?? productRow.product.listPrice);
    const vatRate = toNumber(productRow.product.vatRate || 20) || 20;
    const selectedInventory = inventoryRows.find((row) => row.item.id === input.inventoryItemId)?.item;
    const lines: CpqLine[] = [
      {
        kind: 'product',
        description: `${productRow.brand?.name ? `${productRow.brand.name} ` : ''}${productRow.product.fullName}${selectedInventory ? ` / Seri No: ${selectedInventory.serialNumber}` : ''}`,
        quantity: 1,
        unitPrice: basePrice,
        vatRate,
        productModelId: productRow.product.id,
        inventoryItemId: selectedInventory?.id,
      },
      ...selectedOptions.map<CpqLine>((option) => ({
        kind: 'option',
        description: option.label ?? 'Opsiyon',
        quantity: 1,
        unitPrice: option.priceDelta,
        vatRate,
        optionValueId: option.id,
      })),
    ];
    if (input.includeInstallation) {
      lines.push({ kind: 'service', description: 'Kurulum ve devreye alma', quantity: 1, unitPrice: 600, vatRate });
    }
    if (input.includeLogistics) {
      lines.push({ kind: 'logistics', description: 'Lojistik ve sevkiyat hazırlığı', quantity: 1, unitPrice: 250, vatRate });
    }

    const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
    const vatAmount = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice * (line.vatRate / 100), 0);

    return {
      product: {
        id: productRow.product.id,
        brand: productRow.brand,
        modelCode: productRow.product.modelCode,
        modelName: productRow.product.modelName,
        fullName: productRow.product.fullName,
        currencyCode,
      },
      optionSets: Array.from(optionSets.values()),
      selectedOptions,
      availableSerials: inventoryRows.map((row) => ({
        id: row.item.id,
        serialNumber: row.item.serialNumber,
        controlUnit: row.item.controlUnit,
        controlUnitSerialNumber: row.item.controlUnitSerialNumber,
        status: row.status,
      })),
      recommendedEquipment: equipment.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        unitPrice: toNumber(item.unitPrice),
        isPromotion: item.isPromotion,
      })),
      warnings,
      lines,
      totals: {
        currencyCode,
        subtotal,
        vatAmount,
        grandTotal: subtotal + vatAmount,
      },
    };
  }

  private evaluateRule(rule: typeof productConfigurationRules.$inferSelect, selected: Set<string>, labels: Map<string, string>) {
    const sourceSelected = rule.sourceOptionValueId ? selected.has(rule.sourceOptionValueId) : true;
    const targetSelected = rule.targetOptionValueId ? selected.has(rule.targetOptionValueId) : false;
    const sourceLabel = rule.sourceOptionValueId ? labels.get(rule.sourceOptionValueId) ?? 'Seçilen opsiyon' : 'Konfigürasyon';
    const targetLabel = rule.targetOptionValueId ? labels.get(rule.targetOptionValueId) ?? 'hedef opsiyon' : 'ilgili seçim';
    if (!sourceSelected) return null;
    if (rule.ruleType === 'excludes' && targetSelected) {
      return { type: 'excludes', severity: rule.severity, message: rule.message ?? `${sourceLabel}, ${targetLabel} ile birlikte seçilemez.` };
    }
    if (rule.ruleType === 'requires' && rule.targetOptionValueId && !targetSelected) {
      return { type: 'requires', severity: rule.severity, message: rule.message ?? `${sourceLabel} seçildiğinde ${targetLabel} de seçilmelidir.` };
    }
    if (rule.ruleType === 'recommended' && rule.targetOptionValueId && !targetSelected) {
      return { type: 'recommended', severity: rule.severity, message: rule.message ?? `${sourceLabel} için ${targetLabel} önerilir.` };
    }
    if (rule.ruleType === 'compatible') {
      return { type: 'compatible', severity: rule.severity, message: rule.message ?? `${sourceLabel} bu modelle uyumlu.` };
    }
    return null;
  }

  async createQuoteFromCpq(input: CpqCreateQuoteInput, actor: AuthContext) {
    const preview = await this.cpqPreview(input, actor);
    const quote = await this.quotesService.create(
      {
        companyId: input.companyId,
        contactId: input.contactId,
        quoteDate: new Date(),
        validityDays: input.validityDays ?? 30,
        currencyCode: preview.totals.currencyCode,
        paymentTerms: input.paymentTerms,
        deliveryTerms: input.deliveryTerms,
        warrantyTerms: input.warrantyTerms,
        notes: input.notes ?? 'CPQ sihirbazı ile oluşturuldu.',
      },
      actor
    );

    let sortOrder = 0;
    for (const line of preview.lines) {
      await this.quotesService.addItem(
        quote.id,
        {
          productModelId: line.productModelId,
          inventoryItemId: line.inventoryItemId,
          description: line.description,
          quantity: line.quantity,
          unitCode: 'adet',
          unitPrice: line.unitPrice,
          discountAmount: 0,
          vatRate: line.vatRate,
          sortOrder,
          compatibility: {
            machineIds: line.inventoryItemId ? [line.inventoryItemId] : [],
            brands: [],
            controlUnits: [],
            supplierIds: [],
          },
        },
        actor
      );
      sortOrder += 10;
    }

    await this.db
      .insert(quoteConfigurationSnapshots)
      .values({
        tenantId: actor.tenantId,
        quoteId: quote.id,
        productModelId: input.productModelId,
        inventoryItemId: input.inventoryItemId ?? null,
        snapshot: preview,
        createdBy: actor.userId,
      })
      .onConflictDoUpdate({
        target: quoteConfigurationSnapshots.quoteId,
        set: { snapshot: preview, productModelId: input.productModelId, inventoryItemId: input.inventoryItemId ?? null },
      });

    return { quote: await this.quotesService.get(quote.id, actor), preview };
  }

  async serviceRadar(actor: AuthContext) {
    const rows = await this.db
      .select({
        device: customerDevices,
        company: { id: companies.id, legalTitle: companies.legalTitle, shortName: companies.shortName },
        address: { province: companyAddresses.province, district: companyAddresses.district, locality: companyAddresses.locality },
        inventory: { id: inventoryItems.id, serialNumber: inventoryItems.serialNumber, controlUnit: inventoryItems.controlUnit },
        product: { id: productModels.id, modelCode: productModels.modelCode, modelName: productModels.modelName, fullName: productModels.fullName },
        brand: { name: brands.name },
      })
      .from(customerDevices)
      .leftJoin(companies, eq(customerDevices.companyId, companies.id))
      .leftJoin(companyAddresses, and(eq(companyAddresses.companyId, companies.id), eq(companyAddresses.isDefault, true)))
      .leftJoin(inventoryItems, eq(customerDevices.inventoryItemId, inventoryItems.id))
      .leftJoin(productModels, eq(inventoryItems.productModelId, productModels.id))
      .leftJoin(brands, eq(productModels.brandId, brands.id))
      .where(and(eq(customerDevices.tenantId, actor.tenantId), isNull(customerDevices.deletedAt)))
      .orderBy(desc(customerDevices.warrantyEndDate), desc(customerDevices.createdAt));

    const deviceIds = rows.map((row) => row.device.id);
    const tickets = deviceIds.length
      ? await this.db
          .select({
            ticket: serviceTickets,
            status: { code: serviceTicketStatuses.code, name: serviceTicketStatuses.name },
          })
          .from(serviceTickets)
          .leftJoin(serviceTicketStatuses, eq(serviceTickets.statusId, serviceTicketStatuses.id))
          .where(and(eq(serviceTickets.tenantId, actor.tenantId), inArray(serviceTickets.customerDeviceId, deviceIds), isNull(serviceTickets.deletedAt)))
      : [];
    const events = deviceIds.length
      ? await this.db
          .select()
          .from(machineMaintenanceEvents)
          .where(and(eq(machineMaintenanceEvents.tenantId, actor.tenantId), inArray(machineMaintenanceEvents.customerDeviceId, deviceIds), isNull(machineMaintenanceEvents.deletedAt)))
      : [];

    const ticketsByDevice = new Map<string, typeof tickets>();
    for (const ticket of tickets) {
      if (!ticket.ticket.customerDeviceId) continue;
      const list = ticketsByDevice.get(ticket.ticket.customerDeviceId) ?? [];
      list.push(ticket);
      ticketsByDevice.set(ticket.ticket.customerDeviceId, list);
    }
    const eventsByDevice = new Map<string, typeof events>();
    for (const event of events) {
      const list = eventsByDevice.get(event.customerDeviceId) ?? [];
      list.push(event);
      eventsByDevice.set(event.customerDeviceId, list);
    }

    const now = Date.now();
    const soon = now + 60 * 24 * 60 * 60 * 1000;
    const maintenanceSoon = now + 30 * 24 * 60 * 60 * 1000;

    const items = rows.map((row) => {
      const deviceTickets = ticketsByDevice.get(row.device.id) ?? [];
      const openTickets = deviceTickets.filter((ticket) => !['resolved', 'closed'].includes(ticket.status?.code ?? ''));
      const criticalTickets = openTickets.filter((ticket) => ['critical', 'high'].includes(ticket.ticket.severity));
      const deviceEvents = eventsByDevice.get(row.device.id) ?? [];
      const cost = deviceEvents.reduce((sum, event) => sum + toNumber(event.travelCost) + toNumber(event.laborCost) + toNumber(event.partsCost), 0);
      const revenue = deviceEvents.reduce((sum, event) => sum + toNumber(event.serviceRevenue), 0);
      const margin = revenue - cost;
      const warrantyEnd = row.device.warrantyEndDate ? new Date(row.device.warrantyEndDate).getTime() : null;
      const nextDueDates = deviceEvents.map((event) => (event.nextDueDate ? new Date(event.nextDueDate).getTime() : null)).filter((v): v is number => v != null);
      const nextDue = nextDueDates.length ? Math.min(...nextDueDates) : null;
      const signals = [
        openTickets.length ? 'open_service' : null,
        criticalTickets.length ? 'critical_service' : null,
        warrantyEnd && warrantyEnd < now ? 'warranty_expired' : null,
        warrantyEnd && warrantyEnd >= now && warrantyEnd <= soon ? 'warranty_expiring' : null,
        nextDue && nextDue <= maintenanceSoon ? 'maintenance_due' : null,
        deviceTickets.length >= 3 ? 'repeated_failure' : null,
        revenue > 0 && margin < 0 ? 'low_margin' : null,
      ].filter(Boolean);

      return {
        deviceId: row.device.id,
        company: row.company,
        address: row.address,
        machine: {
          brand: row.brand?.name ?? null,
          model: row.product?.modelName ?? row.product?.fullName ?? null,
          serialNumber: row.inventory?.serialNumber ?? null,
          controlUnit: row.inventory?.controlUnit ?? null,
        },
        warrantyEndDate: isoDate(row.device.warrantyEndDate),
        nextMaintenanceDueDate: nextDue ? new Date(nextDue).toISOString() : null,
        openTicketCount: openTickets.length,
        criticalTicketCount: criticalTickets.length,
        ticketCount: deviceTickets.length,
        serviceCost: cost,
        serviceRevenue: revenue,
        serviceMargin: margin,
        signals,
      };
    });

    return {
      summary: {
        machineCount: items.length,
        openServiceCount: items.reduce((sum, item) => sum + item.openTicketCount, 0),
        criticalMachineCount: items.filter((item) => item.signals.includes('critical_service')).length,
        warrantyExpiringCount: items.filter((item) => item.signals.includes('warranty_expiring')).length,
        maintenanceDueCount: items.filter((item) => item.signals.includes('maintenance_due')).length,
        lowMarginCount: items.filter((item) => item.signals.includes('low_margin')).length,
      },
      items,
    };
  }
}
