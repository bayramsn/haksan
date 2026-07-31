import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, ilike, inArray, isNotNull, isNull, ne, not, or, sql } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import {
  companies,
  companyAccessRequests,
  companyAddresses,
  companyDivisions,
  companyGroupAssignments,
  companyPhones,
  companyEmails,
  contacts,
  notifications,
} from '../../db/schema/companies';
import { accountingInvoices, payments, receivables } from '../../db/schema/finance';
import { customerDevices } from '../../db/schema/inventory';
import { salesOrders } from '../../db/schema/orders';
import { quotes } from '../../db/schema/quotes';
import { opportunities, salesActivities } from '../../db/schema/crm';
import { deliveries, installationJobs, serviceTickets, shipments } from '../../db/schema/service';
import { divisions } from '../../db/schema/tenants';
import { users, userDivisions } from '../../db/schema/users';
import { companyRelationTypes, companyStatuses, companyGroups, contactSources, fileDocumentTypes, paymentStatuses } from '../../db/schema/lookup';
import { files, fileLinks } from '../../db/schema/files';
import { DB } from '../../shared/database/database.module';
import { CompanyWebsiteLookupError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/utils/errors';
import type { AuthContext } from '../../shared/security/auth.types';
import type {
  CompanyAccessRequestInput,
  CompanyAccessRequestDecisionInput,
  CompanyAddressInput,
  CompanyCreateInput,
  CompanyLocationInput,
  CompanyOsmSearchQuery,
  CompanyOsmSearchResult,
  CompanyWebsiteLookupInput,
  CompanyWebsiteLookupResult,
  CompanyUpdateInput,
  CompanyListQuery,
  Pagination,
} from '@haksan/shared';
import { buildPaginated, pageOffset } from '../../shared/utils/pagination';
import { lookupIdByCode } from '../../shared/utils/lookup.helper';
import { AuditService } from '../../shared/database/audit.service';
import {
  assertCanUseResourceDivision,
  companyPortfolioFilter,
  resolveAssignedDivision,
  resolveAssignedResourceDivision,
  resolveResourceDivisionScope,
  type DivisionScope,
} from '../../shared/utils/division-scope';
import { companyVisibilityFilter } from '../../shared/utils/company-visibility';
import { normalizeCompanyName } from '../../shared/utils/text-normalization';
import { inspectOfficialCompanyWebsite } from './company-website-lookup';
import { companyLogoPath } from './company-media.service';

const COMPANY_LOGO_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const COMPANY_LOGO_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp']);
const MAX_COMPANY_LOGO_BYTES = 5 * 1024 * 1024;

const TURKISH_FOLD_MAP: Record<string, string> = {
  ç: 'c',
  Ç: 'C',
  ğ: 'g',
  Ğ: 'G',
  ı: 'i',
  I: 'I',
  İ: 'I',
  ö: 'o',
  Ö: 'O',
  ş: 's',
  Ş: 'S',
  ü: 'u',
  Ü: 'U',
};

const compactOsmPart = (value?: string | null) =>
  value
    ?.trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/,+/g, ',')
    .replace(/^,|,$/g, '')
    .trim() || '';

const foldTurkishForOsm = (value: string) =>
  value
    .replace(/[çÇğĞıIİöÖşŞüÜ]/g, (char) => TURKISH_FOLD_MAP[char] ?? char)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const stripCompanySuffixes = (value: string) =>
  value
    .replace(/\b(a\.?\s*ş\.?|anonim|limited|ltd\.?|şti\.?|şirketi|sanayi|san\.?|ticaret|tic\.?|ithalat|ihracat|pazarlama|ve)\b/giu, ' ')
    .replace(/[^\p{L}\p{N}\s.-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const uniqueTexts = (values: string[]) => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = compactOsmPart(raw);
    if (value.length < 2) continue;
    const key = value.toLocaleLowerCase('tr-TR');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
};

const joinOsmParts = (parts: Array<string | undefined | null>) =>
  uniqueTexts(parts.map(compactOsmPart)).join(', ');

const normalizeCountryForOsm = (value?: string | null) =>
  foldTurkishForOsm(compactOsmPart(value))
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z]/g, '');

const OSM_MATCH_STOP_WORDS = new Set([
  'mah', 'mahalle', 'mahallesi', 'cad', 'cadde', 'caddesi', 'sok', 'sokak', 'sokagi',
  'no', 'numara', 'kat', 'blok', 'ic', 'kapi', 'san', 'sanayi', 'sitesi', 'site', 'the',
  'and', 'road', 'street', 'district', 'city', 'village',
]);

const normalizeOsmMatchText = (value?: string | null) =>
  foldTurkishForOsm(compactOsmPart(value))
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const osmMatchTokens = (value?: string | null) =>
  new Set(
    normalizeOsmMatchText(value)
      .split(' ')
      .filter((token) => token.length >= 2 && !OSM_MATCH_STOP_WORDS.has(token)),
  );

const tokenCoverage = (expected: Set<string>, actual: Set<string>) => {
  if (!expected.size) return 0;
  let matched = 0;
  for (const token of expected) if (actual.has(token)) matched += 1;
  return matched / expected.size;
};

const includesOsmScope = (haystack: string, value?: string | null) => {
  const needle = normalizeOsmMatchText(value);
  return !needle || haystack.includes(needle);
};

const osmAddressScopeMatches = (
  address: Record<string, unknown>,
  keys: string[],
  value?: string | null,
) => {
  const needle = normalizeOsmMatchText(value);
  if (!needle) return false;
  return keys.some((key) => {
    const raw = address[key];
    if (typeof raw !== 'string') return false;
    const candidate = normalizeOsmMatchText(raw);
    return candidate === needle || ` ${candidate} `.includes(` ${needle} `);
  });
};

const OSM_CITY_ADDRESS_KEYS = ['city', 'province', 'state', 'state_district'];
const OSM_DISTRICT_ADDRESS_KEYS = [
  'city_district',
  'district',
  'county',
  'municipality',
  'town',
  'borough',
  'suburb',
];

const osmCountryMatches = (
  country: string | null | undefined,
  resultText: string,
  address: Record<string, unknown>,
) => {
  const normalized = normalizeCountryForOsm(country || 'Türkiye');
  const resultCode = typeof address.country_code === 'string' ? address.country_code.toLowerCase() : '';
  if (['turkiye', 'turkey', 'turkei'].includes(normalized)) {
    return resultCode ? resultCode === 'tr' : /\b(turkiye|turkey|turkei)\b/.test(resultText);
  }
  if (['taiwan', 'republicofchina'].includes(normalized)) {
    return resultCode ? resultCode === 'tw' : /\b(taiwan|republic of china)\b/.test(resultText);
  }
  return includesOsmScope(resultText, country);
};

type OsmRawResult = {
  displayName: string;
  type: string | null;
  category: string | null;
  address?: Record<string, unknown>;
};

export const scoreOsmResult = (query: CompanyOsmSearchQuery, row: OsmRawResult) => {
  const address = row.address ?? {};
  const addressText = Object.values(address)
    .filter((value): value is string => typeof value === 'string')
    .join(' ');
  const resultText = normalizeOsmMatchText(`${row.displayName} ${addressText}`);
  const resultTokens = osmMatchTokens(resultText);
  const nameTokens = osmMatchTokens(stripCompanySuffixes(query.q));
  const addressTokens = osmMatchTokens(query.address);
  const nameCoverage = tokenCoverage(nameTokens, resultTokens);
  const addressCoverage = tokenCoverage(addressTokens, resultTokens);
  const cityMatches = includesOsmScope(resultText, query.city);
  const districtMatches = includesOsmScope(resultText, query.district);
  const cityAddressMatches = osmAddressScopeMatches(address, OSM_CITY_ADDRESS_KEYS, query.city);
  const districtAddressMatches = osmAddressScopeMatches(address, OSM_DISTRICT_ADDRESS_KEYS, query.district);
  const countryMatches = osmCountryMatches(query.country, resultText, address);
  const expectedNumbers = normalizeOsmMatchText(query.address).match(/\b\d+[a-z]?\b/g) ?? [];
  const resultNumbers = new Set(resultText.match(/\b\d+[a-z]?\b/g) ?? []);
  const numberMatches = expectedNumbers.length > 0 && expectedNumbers.some((number) => resultNumbers.has(number));
  const nonPoiCategories = new Set(['boundary', 'highway', 'place']);
  const nonPoiTypes = new Set([
    'administrative', 'city', 'town', 'village', 'municipality', 'county', 'state',
    'suburb', 'neighbourhood', 'quarter', 'residential', 'road', 'unclassified',
  ]);
  const isPoi = !nonPoiCategories.has(row.category ?? '') && !nonPoiTypes.has(row.type ?? '');
  const scopeMatches = cityMatches && countryMatches;
  const exactByPoi = scopeMatches && isPoi && nameCoverage >= 0.5 && (districtMatches || addressCoverage >= 0.2);
  const exactByAddress = scopeMatches && numberMatches && addressCoverage >= 0.4 && (districtMatches || cityMatches);

  if (exactByPoi || exactByAddress) {
    const score = Math.min(100, Math.round(72 + nameCoverage * 12 + addressCoverage * 10 + (numberMatches ? 6 : 0)));
    return {
      eligible: true,
      matchQuality: 'exact' as const,
      matchScore: score,
      matchReason: exactByPoi ? 'Firma adı ve adres bölgesi eşleşiyor' : 'Kapı numarası ve adres bileşenleri eşleşiyor',
    };
  }

  const streetLike = ['road', 'residential', 'unclassified', 'service'].includes(row.type ?? '') || row.category === 'highway';
  if (scopeMatches && (addressCoverage >= 0.2 || streetLike) && (districtMatches || addressCoverage >= 0.45)) {
    return {
      eligible: true,
      matchQuality: 'street' as const,
      matchScore: Math.min(79, Math.round(45 + addressCoverage * 25 + (districtMatches ? 8 : 0))),
      matchReason: 'Sokak/cadde bulundu; bina veya firma girişi doğrulanamadı',
    };
  }

  const hasCity = Boolean(compactOsmPart(query.city));
  const hasDistrict = Boolean(compactOsmPart(query.district));
  const areaScore = Math.min(
    79,
    25
      + (hasCity ? (cityAddressMatches ? 15 : cityMatches ? 8 : 0) : 5)
      + (hasDistrict && districtMatches ? (districtAddressMatches ? 20 : 12) : 0)
      + (countryMatches ? 5 : 0)
      + (cityAddressMatches && districtAddressMatches ? 10 : 0)
      + Math.min(3, Math.round(nameCoverage * 3))
      + Math.min(2, Math.round(addressCoverage * 2)),
  );
  const areaReason = hasDistrict && districtMatches
    ? cityAddressMatches && districtAddressMatches
      ? 'İl ve ilçe eşleşti; koordinat ilçe merkezi düzeyinde'
      : 'İlçe eşleşti; koordinat yaklaşık bölge merkezidir'
    : hasCity && cityMatches
      ? 'İl eşleşti; koordinat şehir merkezi düzeyinde'
      : 'Yaklaşık bölge merkezi sonucu';

  return {
    eligible: scopeMatches,
    matchQuality: 'area' as const,
    matchScore: scopeMatches ? areaScore : 0,
    matchReason: areaReason,
  };
};

export const osmCountryCodeFilter = (country?: string | null) => {
  const normalized = normalizeCountryForOsm(country || 'Türkiye');
  return ['turkiye', 'turkey', 'turkei'].includes(normalized) ? 'tr' : null;
};

export const buildOsmSearchCandidates = (query: CompanyOsmSearchQuery) => {
  const q = compactOsmPart(query.q);
  const stripped = stripCompanySuffixes(q);
  const foldedStripped = stripCompanySuffixes(foldTurkishForOsm(q));
  const names = uniqueTexts([q, stripped, foldedStripped]).slice(0, 3);
  const address = compactOsmPart(query.address);
  const district = compactOsmPart(query.district);
  const city = compactOsmPart(query.city);
  const country = compactOsmPart(query.country) || 'Türkiye';
  const candidates: string[] = [];

  for (const name of names) {
    candidates.push(joinOsmParts([name, address, district, city, country]));
  }

  // Firma/POI adı OSM'de kayıtlı olmayabilir. Tam adres ve son olarak ilçe/il
  // merkezi geri dönüşleri sayesinde kullanıcı yine doğrulanabilir bir pin seçer.
  if (address) candidates.push(joinOsmParts([address, district, city, country]));
  if (district || city) candidates.push(joinOsmParts([district, city, country]));
  if (city) candidates.push(joinOsmParts([city, country]));

  return uniqueTexts(candidates).slice(0, 6);
};

const nominatimEndpoint = () => {
  const configured = process.env.OSM_NOMINATIM_URL?.trim();
  const url = new URL(configured || 'https://nominatim.openstreetmap.org/search');
  if (url.protocol !== 'https:') throw new Error('OSM_NOMINATIM_URL must use HTTPS');
  return url;
};

const osmRequestIdentity = () => {
  const appUrl = process.env.APP_PUBLIC_URL?.trim() || 'http://localhost:5173';
  return {
    Referer: appUrl,
    'User-Agent': `Haksan-CRM-ERP/1.0 (+${appUrl})`,
  };
};

const normalizedOsmWebsite = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`;
    const url = new URL(withScheme);
    if (url.protocol === 'http:') url.protocol = 'https:';
    if (url.protocol !== 'https:' || !url.hostname.includes('.')) return undefined;
    url.hash = '';
    return url.toString();
  } catch {
    return undefined;
  }
};

@Injectable()
export class CompaniesService {
  private readonly osmCache = new Map<string, { expiresAt: number; results: CompanyOsmSearchResult[] }>();
  private readonly websiteLookupCache = new Map<string, { expiresAt: number; result: CompanyWebsiteLookupResult }>();
  private osmLastRequestAt = 0;

  constructor(
    @Inject(DB) private readonly db: DbClient,
    private readonly audit: AuditService
  ) {}

  private scope(actor: AuthContext): DivisionScope {
    return resolveResourceDivisionScope(actor, 'companies');
  }

  private async resolveCreateDivision(input: CompanyCreateInput, actor: AuthContext): Promise<string> {
    const assigned = resolveAssignedResourceDivision(actor, 'companies', input.divisionId ?? null);
    if (assigned) {
      await this.assertDivision(assigned, actor);
      return assigned;
    }
    if (input.companyGroupCode && ['cnc', 'universal', 'sac_isleme'].includes(input.companyGroupCode)) {
      const division = await this.db.query.divisions.findFirst({
        where: and(eq(divisions.tenantId, actor.tenantId), eq(divisions.code, input.companyGroupCode)),
      });
      if (division) return division.id;
    }
    throw new ValidationError('Firma için CNC / Üniversal / Sac İşleme bölümü seçimi zorunludur', { field: 'divisionId' });
  }

  private async assertDivision(divisionId: string, actor: AuthContext) {
    const division = await this.db.query.divisions.findFirst({
      where: and(eq(divisions.id, divisionId), eq(divisions.tenantId, actor.tenantId), eq(divisions.isActive, true)),
    });
    if (!division) throw new NotFoundError('Bölüm');
    assertCanUseResourceDivision(actor, 'companies', divisionId);
    return division;
  }

  private async hasCompanyDivision(companyId: string, divisionId: string): Promise<boolean> {
    const row = await this.db.query.companyDivisions.findFirst({
      where: and(eq(companyDivisions.companyId, companyId), eq(companyDivisions.divisionId, divisionId)),
    });
    return !!row;
  }

  private async assertCompanyVisible(companyId: string, actor: AuthContext) {
    const filters = [eq(companies.id, companyId), eq(companies.tenantId, actor.tenantId), isNull(companies.deletedAt)];
    const portfolio = companyPortfolioFilter(this.scope(actor), companies.id);
    if (portfolio) filters.push(portfolio);
    const visibility = await companyVisibilityFilter(this.db, actor);
    if (visibility) filters.push(visibility);
    const row = await this.db.query.companies.findFirst({ where: and(...filters) });
    if (!row) throw new NotFoundError('Firma');
    return row;
  }

  private async assertCompanyLogoFile(fileId: string, companyId: string, actor: AuthContext): Promise<void> {
    const [logo] = await this.db
      .select({
        mimeType: files.mimeType,
        extension: files.extension,
        sizeBytes: files.sizeBytes,
      })
      .from(files)
      .innerJoin(fileLinks, eq(fileLinks.fileId, files.id))
      .innerJoin(fileDocumentTypes, eq(fileLinks.documentTypeId, fileDocumentTypes.id))
      .where(
        and(
          eq(files.id, fileId),
          eq(files.tenantId, actor.tenantId),
          eq(files.bucket, 'erp-company-logos'),
          eq(files.visibility, 'public'),
          eq(files.uploadStatus, 'linked'),
          isNull(files.deletedAt),
          eq(fileLinks.tenantId, actor.tenantId),
          eq(fileLinks.entityType, 'company'),
          eq(fileLinks.entityId, companyId),
          eq(fileDocumentTypes.code, 'company_logo'),
        ),
      )
      .limit(1);

    if (
      !logo
      || !COMPANY_LOGO_MIME_TYPES.has(logo.mimeType)
      || !COMPANY_LOGO_EXTENSIONS.has(logo.extension.toLocaleLowerCase('en-US'))
      || logo.sizeBytes <= 0
      || logo.sizeBytes > MAX_COMPANY_LOGO_BYTES
    ) {
      throw new ValidationError('Firma logosu geçersiz veya bu firmaya bağlı değil', { field: 'logoFileId' });
    }
  }

  private async companyDivisionRows(companyIds: string[]) {
    if (!companyIds.length) return [];
    return this.db
      .select({
        companyId: companyDivisions.companyId,
        id: divisions.id,
        code: divisions.code,
        name: divisions.name,
      })
      .from(companyDivisions)
      .innerJoin(divisions, eq(companyDivisions.divisionId, divisions.id))
      .where(inArray(companyDivisions.companyId, companyIds));
  }

  private async companyGroupRows(companyIds: string[]) {
    if (!companyIds.length) return [];
    return this.db
      .select({
        companyId: companyGroupAssignments.companyId,
        id: companyGroups.id,
        code: companyGroups.code,
        name: companyGroups.name,
      })
      .from(companyGroupAssignments)
      .innerJoin(companyGroups, eq(companyGroupAssignments.companyGroupId, companyGroups.id))
      .where(inArray(companyGroupAssignments.companyId, companyIds));
  }

  private async resolveCompanyGroups(codes: string[] | undefined): Promise<Array<{ id: string; code: string }>> {
    const uniqueCodes = Array.from(new Set((codes ?? []).map((code) => code.trim()).filter(Boolean)));
    if (!uniqueCodes.length) return [];
    const rows = await this.db
      .select({ id: companyGroups.id, code: companyGroups.code })
      .from(companyGroups)
      .where(inArray(companyGroups.code, uniqueCodes));
    const found = new Set(rows.map((row) => row.code));
    const missing = uniqueCodes.filter((code) => !found.has(code));
    if (missing.length) throw new ValidationError('Geçersiz firma grubu seçildi', { field: 'companyGroupCodes', codes: missing });
    const byCode = new Map(rows.map((row) => [row.code, row]));
    return uniqueCodes.map((code) => byCode.get(code)!);
  }

  private addressRoleIndexes(addresses: CompanyAddressInput[]) {
    if (!addresses.length) return { defaultIndex: -1, shippingIndex: -1, billingIndex: -1 };

    const selectedIndex = (role: 'isDefault' | 'isShipping' | 'isBilling') => {
      const selected = addresses
        .map((address, index) => address[role] ? index : -1)
        .filter((index) => index >= 0);
      if (selected.length > 1) {
        throw new ValidationError('Her adres rolü için yalnızca bir adres seçilebilir', {
          field: `addresses.${role}`,
        });
      }
      return selected[0] ?? -1;
    };

    return {
      defaultIndex: selectedIndex('isDefault'),
      shippingIndex: selectedIndex('isShipping'),
      billingIndex: selectedIndex('isBilling'),
    };
  }

  private addressValues(
    companyId: string,
    tenantId: string,
    address: CompanyAddressInput,
    roles: { isDefault: boolean; isShipping: boolean; isBilling: boolean },
  ) {
    return {
      tenantId,
      companyId,
      addressType: address.addressType,
      country: address.country ?? 'Türkiye',
      province: address.province ?? null,
      district: address.district ?? null,
      locality: address.locality ?? null,
      zipCode: address.zipCode ?? null,
      street: address.street ?? null,
      buildingNumber: address.buildingNumber ?? null,
      fullAddress: address.fullAddress ?? null,
      latitude: address.latitude != null ? String(address.latitude) : null,
      longitude: address.longitude != null ? String(address.longitude) : null,
      locationSource: address.latitude != null && address.longitude != null ? 'manual' : null,
      ...roles,
      deletedAt: null,
    };
  }

  private async createdByUser(createdBy: string | null | undefined, tenantId: string) {
    if (!createdBy) return null;
    const [row] = await this.db
      .select({ id: users.id, fullName: users.fullName, email: users.email })
      .from(users)
      .where(and(eq(users.id, createdBy), eq(users.tenantId, tenantId)))
      .limit(1);
    return row ?? null;
  }

  async list(actor: AuthContext, query: CompanyListQuery, page: Pagination) {
    const { limit, offset } = pageOffset(page);
    const filters = [eq(companies.tenantId, actor.tenantId), isNull(companies.deletedAt)];
    if (query.search) {
      filters.push(
        or(
          ilike(companies.legalTitle, `%${query.search}%`),
          ilike(companies.shortName, `%${query.search}%`),
          ilike(companies.externalCompanyNo, `%${query.search}%`),
          ilike(companies.taxNumber, `%${query.search}%`)
        )!
      );
    }
    if (query.relationTypeCode) {
      const relId = await lookupIdByCode(this.db, companyRelationTypes, query.relationTypeCode);
      if (relId) filters.push(eq(companies.relationTypeId, relId));
    }
    if (query.customerStatusCode) {
      const sid = await lookupIdByCode(this.db, companyStatuses, query.customerStatusCode);
      if (sid) filters.push(eq(companies.customerStatusId, sid));
    }
    if (query.divisionId) {
      filters.push(sql`exists (
        select 1 from company_divisions selected_cd
        where selected_cd.company_id = ${companies.id}
          and selected_cd.division_id = ${query.divisionId}
      )`);
    }
    const portfolio = companyPortfolioFilter(this.scope(actor), companies.id);
    if (portfolio) filters.push(portfolio);
    const visibility = await companyVisibilityFilter(this.db, actor);
    if (visibility) filters.push(visibility);

    const where = and(...filters);
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(companies)
      .where(where);

    const rows = await this.db
      .select({
        company: companies,
        relationType: { code: companyRelationTypes.code, name: companyRelationTypes.name },
        customerStatus: { code: companyStatuses.code, name: companyStatuses.name },
        companyGroup: { code: companyGroups.code, name: companyGroups.name },
        contactSource: { code: contactSources.code, name: contactSources.name },
        createdByUser: { id: users.id, fullName: users.fullName, email: users.email },
      })
      .from(companies)
      .leftJoin(companyRelationTypes, eq(companies.relationTypeId, companyRelationTypes.id))
      .leftJoin(companyStatuses, eq(companies.customerStatusId, companyStatuses.id))
      .leftJoin(companyGroups, eq(companies.companyGroupId, companyGroups.id))
      .leftJoin(contactSources, eq(companies.contactSourceId, contactSources.id))
      .leftJoin(users, and(eq(companies.createdBy, users.id), eq(users.tenantId, actor.tenantId)))
      .where(where)
      .orderBy(desc(companies.createdAt), desc(companies.id))
      .limit(limit)
      .offset(offset);

    const companyIds = rows.map((r) => r.company.id);
    const [addresses, phones, emails, divisionRows, groupRows] = companyIds.length
      ? await Promise.all([
          this.db.select().from(companyAddresses).where(and(inArray(companyAddresses.companyId, companyIds), isNull(companyAddresses.deletedAt))),
          this.db.select().from(companyPhones).where(and(inArray(companyPhones.companyId, companyIds), isNull(companyPhones.deletedAt))),
          this.db.select().from(companyEmails).where(and(inArray(companyEmails.companyId, companyIds), isNull(companyEmails.deletedAt))),
          this.companyDivisionRows(companyIds),
          this.companyGroupRows(companyIds),
        ])
      : [[], [], [], [], []];

    return buildPaginated(
      rows.map((r) => {
        const rowPhones = phones.filter((p) => p.companyId === r.company.id);
        const rowEmails = emails.filter((e) => e.companyId === r.company.id);
        return {
          ...r.company,
          logoUrl: r.company.logoFileId ? companyLogoPath(r.company.logoFileId) : null,
          relationType: r.relationType,
          customerStatus: r.customerStatus,
          companyGroup: r.companyGroup,
          companyGroups: groupRows
            .filter((group) => group.companyId === r.company.id)
            .map(({ companyId: _companyId, ...group }) => group),
          contactSource: r.contactSource,
          createdByUser: r.createdByUser?.id ? r.createdByUser : null,
          primaryAddress: addresses.find((a) => a.companyId === r.company.id && a.isDefault) ?? addresses.find((a) => a.companyId === r.company.id) ?? null,
          addresses: addresses.filter((a) => a.companyId === r.company.id),
          primaryPhone: rowPhones.find((p) => p.phoneType === 'main')?.phone ?? rowPhones.find((p) => p.isDefault)?.phone ?? null,
          secondaryPhone: rowPhones.find((p) => p.phoneType === 'secondary')?.phone ?? null,
          fax: rowPhones.find((p) => p.phoneType === 'fax')?.phone ?? null,
          primaryEmail: rowEmails.find((e) => e.emailType === 'main')?.email ?? rowEmails.find((e) => e.isDefault)?.email ?? null,
          secondaryEmail: rowEmails.find((e) => e.emailType === 'secondary')?.email ?? null,
          divisions: divisionRows.filter((d) => d.companyId === r.company.id).map(({ companyId: _companyId, ...d }) => d),
        };
      }),
      count,
      page
    );
  }

  async get(id: string, actor: AuthContext) {
    const row = await this.assertCompanyVisible(id, actor);

    const [addresses, phones, emails, divisionRows, groupRows] = await Promise.all([
      this.db.select().from(companyAddresses).where(and(eq(companyAddresses.companyId, id), isNull(companyAddresses.deletedAt))),
      this.db.select().from(companyPhones).where(and(eq(companyPhones.companyId, id), isNull(companyPhones.deletedAt))),
      this.db.select().from(companyEmails).where(and(eq(companyEmails.companyId, id), isNull(companyEmails.deletedAt))),
      this.companyDivisionRows([id]),
      this.companyGroupRows([id]),
    ]);
    const creator = await this.createdByUser(row.createdBy, actor.tenantId);
    return {
      ...row,
      logoUrl: row.logoFileId ? companyLogoPath(row.logoFileId) : null,
      createdByUser: creator,
      addresses,
      phones,
      emails,
      divisions: divisionRows.map(({ companyId: _companyId, ...d }) => d),
      companyGroups: groupRows.map(({ companyId: _companyId, ...group }) => group),
    };
  }

  async searchOpenStreetMap(query: CompanyOsmSearchQuery, _actor: AuthContext): Promise<CompanyOsmSearchResult[]> {
    const candidates = buildOsmSearchCandidates(query);
    const cacheKey = candidates.join('|').toLocaleLowerCase('tr-TR');
    const cached = this.osmCache.get(cacheKey);
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.results;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const byId = new Map<string, CompanyOsmSearchResult>();
      for (const searchText of candidates) {
        const waitMs = Math.max(0, 1000 - (Date.now() - this.osmLastRequestAt));
        if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
        this.osmLastRequestAt = Date.now();

        const url = nominatimEndpoint();
        url.searchParams.set('q', searchText);
        url.searchParams.set('format', 'jsonv2');
        url.searchParams.set('addressdetails', '1');
        url.searchParams.set('extratags', '1');
        url.searchParams.set('limit', '5');
        url.searchParams.set('accept-language', 'tr');
        const countryCode = osmCountryCodeFilter(query.country);
        if (countryCode) url.searchParams.set('countrycodes', countryCode);

        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
            ...osmRequestIdentity(),
          },
        });
        if (!response.ok) {
          throw new ValidationError('OpenStreetMap araması şu anda yanıt vermiyor', { status: response.status });
        }
        const rows = (await response.json()) as Array<Record<string, unknown>>;
        const results = rows
          .map((row, index): CompanyOsmSearchResult | null => {
            const latitude = Number(row.lat);
            const longitude = Number(row.lon);
            const displayName = typeof row.display_name === 'string' ? row.display_name : '';
            if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !displayName) return null;
            const type = typeof row.type === 'string' ? row.type : null;
            const category = typeof row.category === 'string' ? row.category : null;
            const address = row.address && typeof row.address === 'object' ? (row.address as Record<string, unknown>) : undefined;
            const extraTags = row.extratags && typeof row.extratags === 'object' ? row.extratags as Record<string, unknown> : {};
            const website = normalizedOsmWebsite(extraTags.website ?? extraTags['contact:website'] ?? extraTags.url);
            const phone = compactOsmPart(typeof extraTags.phone === 'string' ? extraTags.phone : typeof extraTags['contact:phone'] === 'string' ? extraTags['contact:phone'] : '').slice(0, 64) || undefined;
            const rawEmail = compactOsmPart(typeof extraTags.email === 'string' ? extraTags.email : typeof extraTags['contact:email'] === 'string' ? extraTags['contact:email'] : '').slice(0, 254);
            const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) ? rawEmail : undefined;
            const match = scoreOsmResult(query, { displayName, type, category, address });
            if (!match.eligible) return null;
            return {
              id: String(row.place_id ?? `${cacheKey}:${index}`),
              displayName,
              latitude,
              longitude,
              type,
              category,
              importance: Number.isFinite(Number(row.importance)) ? Number(row.importance) : null,
              matchQuality: match.matchQuality,
              matchScore: match.matchScore,
              matchReason: match.matchReason,
              website,
              phone,
              email,
              address,
            };
          })
          .filter((row): row is CompanyOsmSearchResult => row != null);

        for (const result of results) {
          const current = byId.get(result.id);
          if (!current || result.matchScore > current.matchScore) byId.set(result.id, result);
        }
        if (Array.from(byId.values()).filter((result) => result.matchQuality === 'exact').length >= 3) break;
      }
      const qualityRank = { exact: 0, street: 1, area: 2 } as const;
      const results = Array.from(byId.values())
        .sort((a, b) => qualityRank[a.matchQuality] - qualityRank[b.matchQuality] || b.matchScore - a.matchScore)
        .slice(0, 5);
      // Başarılı sonuçları uzun, boş sonuçları kısa tut. Böylece geçici OSM veri/ağ
      // durumları kullanıcıyı on dakika boyunca yanlış bir boş sonuca kilitlemez.
      const ttlMs = results.length > 0 ? 10 * 60 * 1000 : 60 * 1000;
      this.osmCache.set(cacheKey, { expiresAt: Date.now() + ttlMs, results });
      return results;
    } catch (err) {
      if (err instanceof ValidationError) throw err;
      throw new ValidationError('OpenStreetMap araması tamamlanamadı');
    } finally {
      clearTimeout(timeout);
    }
  }

  async lookupCompanyWebsite(query: CompanyWebsiteLookupInput, actor: AuthContext): Promise<CompanyWebsiteLookupResult> {
    const cacheKey = JSON.stringify({
      q: query.q.toLocaleLowerCase('tr-TR'),
      website: query.website?.toLocaleLowerCase('en-US') ?? '',
      city: query.city?.toLocaleLowerCase('tr-TR') ?? '',
      district: query.district?.toLocaleLowerCase('tr-TR') ?? '',
      country: query.country?.toLocaleLowerCase('tr-TR') ?? '',
    });
    const cached = this.websiteLookupCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.result;

    let website = query.website;
    let discoveredViaOsm = false;
    let exactOsmResult: CompanyOsmSearchResult | undefined;
    if (!website) {
      const osmResults = await this.searchOpenStreetMap(query, actor);
      exactOsmResult = osmResults.find((result) => result.matchQuality === 'exact' && result.website);
      website = exactOsmResult?.website;
      discoveredViaOsm = Boolean(website);
    }
    if (!website) {
      throw new CompanyWebsiteLookupError(
        'Resmî site otomatik bulunamadı. Web sitesi alanını yazıp tekrar deneyin.',
        { reason: 'WEBSITE_NOT_FOUND' },
      );
    }

    const result = await inspectOfficialCompanyWebsite(query, website, discoveredViaOsm);
    if (result.suggestion.latitude == null || result.suggestion.longitude == null) {
      if (!exactOsmResult && result.suggestion.address) {
        const geocoded = await this.searchOpenStreetMap({
          ...query,
          address: result.suggestion.address,
          city: result.suggestion.city ?? query.city,
          district: result.suggestion.district ?? query.district,
          country: result.suggestion.country ?? query.country,
        }, actor);
        exactOsmResult = geocoded.find((row) => row.matchQuality === 'exact');
      }
      if (exactOsmResult) {
        result.suggestion.latitude = exactOsmResult.latitude;
        result.suggestion.longitude = exactOsmResult.longitude;
        result.warnings = result.warnings.filter((warning) => !warning.includes('kesin koordinat'));
        result.matchReason += ' Konum, resmî adresle eşleşen doğrulanmış harita kaydından alındı.';
      }
    }

    this.websiteLookupCache.set(cacheKey, { expiresAt: Date.now() + 10 * 60 * 1000, result });
    return result;
  }

  async create(input: CompanyCreateInput, actor: AuthContext) {
    const divisionId = await this.resolveCreateDivision(input, actor);
    if (input.externalCompanyNo) {
      const existing = await this.db.query.companies.findFirst({
        where: and(
          eq(companies.tenantId, actor.tenantId),
          eq(companies.externalCompanyNo, input.externalCompanyNo),
          isNull(companies.deletedAt)
        ),
      });
      if (existing) throw new ConflictError('Bu firma numarası ile bir firma zaten kayıtlı');
    }
    if (input.taxNumber) {
      const existing = await this.db.query.companies.findFirst({
        where: and(
          eq(companies.tenantId, actor.tenantId),
          eq(companies.taxNumber, input.taxNumber),
          isNull(companies.deletedAt)
        ),
      });
      if (existing) {
        if (await this.hasCompanyDivision(existing.id, divisionId)) {
          throw new ConflictError('Bu vergi numarası ile bir firma zaten kayıtlı');
        }
        const request = await this.createAccessRequestForDivision(existing.id, divisionId, actor, {
          note: input.notes ?? null,
        });
        throw new ConflictError('Bu vergi numarası başka bir bölüm portföyünde kayıtlı; erişim talebi oluşturuldu', {
          duplicateCompanyId: existing.id,
          accessRequestId: request.id,
          status: request.status,
        });
      }
    }

    const selectedGroupCodes = input.companyGroupCodes ?? (input.companyGroupCode ? [input.companyGroupCode] : []);
    const selectedGroups = await this.resolveCompanyGroups(selectedGroupCodes);
    const [relId, statusId, sourceId] = await Promise.all([
      lookupIdByCode(this.db, companyRelationTypes, input.relationTypeCode),
      lookupIdByCode(this.db, companyStatuses, input.customerStatusCode),
      lookupIdByCode(this.db, contactSources, input.contactSourceCode),
    ]);

    let created: typeof companies.$inferSelect;
    try {
      created = await this.db.transaction(async (tx) => {
        const [company] = await tx
          .insert(companies)
          .values({
            tenantId: actor.tenantId,
            externalCompanyNo: input.externalCompanyNo ?? null,
            companyType: input.companyType,
            relationTypeId: relId,
            customerStatusId: statusId,
            companyGroupId: selectedGroups[0]?.id ?? null,
            contactSourceId: sourceId,
            sector: input.sector ?? null,
            supplierCategoryCode: input.supplierCategoryCode ?? null,
            legalTitle: normalizeCompanyName(input.legalTitle),
            shortName: input.shortName ? normalizeCompanyName(input.shortName) : null,
            taxOffice: input.taxOffice ?? null,
            taxNumber: input.taxNumber ?? null,
            website: input.website ?? null,
            notes: input.notes ?? null,
            createdBy: actor.userId,
            updatedBy: actor.userId,
          })
          .returning();

        await tx
          .insert(companyDivisions)
          .values({
            tenantId: actor.tenantId,
            companyId: company.id,
            divisionId,
            addedByUserId: actor.userId,
          })
          .onConflictDoNothing();

        if (selectedGroups.length) {
          await tx.insert(companyGroupAssignments).values(
            selectedGroups.map((group) => ({
              tenantId: actor.tenantId,
              companyId: company.id,
              companyGroupId: group.id,
            }))
          );
        }

        const addresses: CompanyAddressInput[] = input.addresses?.length
          ? input.addresses
          : input.address
            ? [{ ...input.address, addressType: 'office', isDefault: true, isShipping: true, isBilling: true }]
            : [];
        if (addresses.length) {
          const { defaultIndex, shippingIndex, billingIndex } = this.addressRoleIndexes(addresses);
          await tx.insert(companyAddresses).values(
            addresses.map((address, index) => this.addressValues(company.id, actor.tenantId, address, {
              isDefault: index === defaultIndex,
              isShipping: index === shippingIndex,
              isBilling: index === billingIndex,
            }))
          );
        }
        if (input.primaryPhone) {
          await tx.insert(companyPhones).values({
            tenantId: actor.tenantId,
            companyId: company.id,
            phoneType: 'main',
            phone: input.primaryPhone,
            isDefault: true,
          });
        }
        if (input.secondaryPhone) {
          await tx.insert(companyPhones).values({
            tenantId: actor.tenantId,
            companyId: company.id,
            phoneType: 'secondary',
            phone: input.secondaryPhone,
            isDefault: false,
          });
        }
        if (input.fax) {
          await tx.insert(companyPhones).values({
            tenantId: actor.tenantId,
            companyId: company.id,
            phoneType: 'fax',
            phone: input.fax,
            isDefault: false,
          });
        }
        if (input.primaryEmail) {
          await tx.insert(companyEmails).values({
            tenantId: actor.tenantId,
            companyId: company.id,
            emailType: 'main',
            email: input.primaryEmail,
            isDefault: true,
          });
        }
        if (input.secondaryEmail) {
          await tx.insert(companyEmails).values({
            tenantId: actor.tenantId,
            companyId: company.id,
            emailType: 'secondary',
            email: input.secondaryEmail,
            isDefault: false,
          });
        }

        return company;
      });
    } catch (error: any) {
      if ((error?.code ?? error?.cause?.code) === '23505') {
        throw new ConflictError('Bu vergi numarası ile bir firma zaten kayıtlı');
      }
      throw error;
    }

    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'company.created',
      resourceType: 'company',
      resourceId: created.id,
      newValues: { legalTitle: created.legalTitle, taxNumber: created.taxNumber },
    });
    return this.get(created.id, actor);
  }

  async update(id: string, input: CompanyUpdateInput, actor: AuthContext) {
    const existing = await this.get(id, actor);

    if (input.logoFileId) {
      await this.assertCompanyLogoFile(input.logoFileId, id, actor);
    }

    if (input.externalCompanyNo && input.externalCompanyNo !== existing.externalCompanyNo) {
      const duplicate = await this.db.query.companies.findFirst({
        where: and(
          eq(companies.tenantId, actor.tenantId),
          eq(companies.externalCompanyNo, input.externalCompanyNo),
          isNull(companies.deletedAt),
          ne(companies.id, id)
        ),
      });
      if (duplicate) throw new ConflictError('Bu firma numarası ile bir firma zaten kayıtlı');
    }

    if (input.taxNumber && input.taxNumber !== existing.taxNumber) {
      const duplicate = await this.db.query.companies.findFirst({
        where: and(
          eq(companies.tenantId, actor.tenantId),
          eq(companies.taxNumber, input.taxNumber),
          isNull(companies.deletedAt),
          ne(companies.id, id)
        ),
      });
      if (duplicate) throw new ConflictError('Bu vergi numarası ile bir firma zaten kayıtlı');
    }

    const groupSelectionProvided = input.companyGroupCodes !== undefined || input.companyGroupCode !== undefined;
    const selectedGroupCodes = input.companyGroupCodes ?? (input.companyGroupCode ? [input.companyGroupCode] : []);
    const selectedGroups = groupSelectionProvided ? await this.resolveCompanyGroups(selectedGroupCodes) : [];
    const [relId, statusId, sourceId] = await Promise.all([
      lookupIdByCode(this.db, companyRelationTypes, input.relationTypeCode),
      lookupIdByCode(this.db, companyStatuses, input.customerStatusCode),
      lookupIdByCode(this.db, contactSources, input.contactSourceCode),
    ]);

    const patch: Record<string, unknown> = {
      updatedBy: actor.userId,
    };
    if (input.companyType !== undefined) patch.companyType = input.companyType;
    if (input.logoFileId !== undefined) patch.logoFileId = input.logoFileId;
    if (input.externalCompanyNo !== undefined) patch.externalCompanyNo = input.externalCompanyNo;
    if (input.relationTypeCode !== undefined) patch.relationTypeId = relId;
    if (input.customerStatusCode !== undefined) patch.customerStatusId = statusId;
    if (groupSelectionProvided) patch.companyGroupId = selectedGroups[0]?.id ?? null;
    if (input.contactSourceCode !== undefined) patch.contactSourceId = sourceId;
    for (const k of ['sector', 'supplierCategoryCode', 'legalTitle', 'shortName', 'taxOffice', 'taxNumber', 'website', 'notes'] as const) {
      if ((input as any)[k] === undefined) continue;
      const value = (input as any)[k];
      patch[k] = (k === 'legalTitle' || k === 'shortName') && value
        ? normalizeCompanyName(value)
        : value ?? null;
    }

    await this.db.transaction(async (tx) => {
      await tx.update(companies).set(patch).where(eq(companies.id, id));

      if (groupSelectionProvided) {
        await tx.delete(companyGroupAssignments).where(eq(companyGroupAssignments.companyId, id));
        if (selectedGroups.length) {
          await tx.insert(companyGroupAssignments).values(
            selectedGroups.map((group) => ({
              tenantId: actor.tenantId,
              companyId: id,
              companyGroupId: group.id,
            }))
          );
        }
      }

      if (input.divisionIds !== undefined) {
        for (const divisionId of input.divisionIds) await this.assertDivision(divisionId, actor);
        await tx.delete(companyDivisions).where(eq(companyDivisions.companyId, id));
        await tx.insert(companyDivisions).values(
          input.divisionIds.map((divisionId) => ({
            tenantId: actor.tenantId,
            companyId: id,
            divisionId,
            addedByUserId: actor.userId,
          }))
        );
      } else if (input.divisionId !== undefined && input.divisionId) {
        const division = await this.assertDivision(input.divisionId, actor);
        await tx
          .insert(companyDivisions)
          .values({ tenantId: actor.tenantId, companyId: id, divisionId: division.id, addedByUserId: actor.userId })
          .onConflictDoNothing();
      }

      if (input.addresses !== undefined) {
        const currentAddresses = await tx
          .select()
          .from(companyAddresses)
          .where(and(eq(companyAddresses.companyId, id), isNull(companyAddresses.deletedAt)));
        const currentById = new Map(currentAddresses.map((address) => [address.id, address]));
        const submittedIds = new Set(input.addresses.map((address) => address.id).filter((value): value is string => !!value));
        const { defaultIndex, shippingIndex, billingIndex } = this.addressRoleIndexes(input.addresses);
        await tx
          .update(companyAddresses)
          .set({ isDefault: false, isShipping: false, isBilling: false })
          .where(and(eq(companyAddresses.companyId, id), isNull(companyAddresses.deletedAt)));
        for (let index = 0; index < input.addresses.length; index++) {
          const address = input.addresses[index];
          const values = this.addressValues(id, actor.tenantId, address, {
            isDefault: index === defaultIndex,
            isShipping: index === shippingIndex,
            isBilling: index === billingIndex,
          });
          if (address.id) {
            if (!currentById.has(address.id)) throw new ValidationError('Firma adresi bulunamadı', { field: 'addresses' });
            await tx.update(companyAddresses).set(values).where(eq(companyAddresses.id, address.id));
          } else {
            await tx.insert(companyAddresses).values(values);
          }
        }
        const removedIds = currentAddresses.map((address) => address.id).filter((addressId) => !submittedIds.has(addressId));
        if (removedIds.length) {
          await tx.update(companyAddresses).set({ deletedAt: new Date() }).where(inArray(companyAddresses.id, removedIds));
        }
      } else if (input.address !== undefined) {
        const currentAddresses = await tx
          .select()
          .from(companyAddresses)
          .where(and(eq(companyAddresses.companyId, id), isNull(companyAddresses.deletedAt)));
        const current = currentAddresses.find((address) => address.isDefault) ?? currentAddresses[0];
        const address: CompanyAddressInput = {
          ...input.address,
          addressType: current?.addressType as CompanyAddressInput['addressType'] ?? 'office',
          isDefault: true,
          isShipping: current?.isShipping ?? true,
          isBilling: current?.isBilling ?? true,
        };
        const values = this.addressValues(id, actor.tenantId, address, {
          isDefault: true,
          isShipping: address.isShipping,
          isBilling: address.isBilling,
        });
        if (current) await tx.update(companyAddresses).set(values).where(eq(companyAddresses.id, current.id));
        else await tx.insert(companyAddresses).values(values);
      }

      const syncPhone = async (phoneType: string, value: string | null | undefined, isDefault: boolean) => {
        if (value === undefined) return;
        const current = await tx.query.companyPhones.findFirst({
          where: and(eq(companyPhones.companyId, id), eq(companyPhones.phoneType, phoneType), isNull(companyPhones.deletedAt)),
        });
        if (value === null) {
          if (current) await tx.update(companyPhones).set({ deletedAt: new Date() }).where(eq(companyPhones.id, current.id));
        } else if (current) {
          await tx.update(companyPhones).set({ phone: value, isDefault, deletedAt: null }).where(eq(companyPhones.id, current.id));
        } else {
          await tx.insert(companyPhones).values({ tenantId: actor.tenantId, companyId: id, phoneType, phone: value, isDefault });
        }
      };
      const syncEmail = async (emailType: string, value: string | null | undefined, isDefault: boolean) => {
        if (value === undefined) return;
        const current = await tx.query.companyEmails.findFirst({
          where: and(eq(companyEmails.companyId, id), eq(companyEmails.emailType, emailType), isNull(companyEmails.deletedAt)),
        });
        if (value === null) {
          if (current) await tx.update(companyEmails).set({ deletedAt: new Date() }).where(eq(companyEmails.id, current.id));
        } else if (current) {
          await tx.update(companyEmails).set({ email: value, isDefault, deletedAt: null }).where(eq(companyEmails.id, current.id));
        } else {
          await tx.insert(companyEmails).values({ tenantId: actor.tenantId, companyId: id, emailType, email: value, isDefault });
        }
      };
      await syncPhone('main', input.primaryPhone, true);
      await syncPhone('secondary', input.secondaryPhone, false);
      await syncPhone('fax', input.fax, false);
      await syncEmail('main', input.primaryEmail, true);
      await syncEmail('secondary', input.secondaryEmail, false);
    });
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'company.updated',
      resourceType: 'company',
      resourceId: id,
      oldValues: existing,
      newValues: patch,
    });
    return this.get(id, actor);
  }

  /** Haritadaki manuel pin düzeltmesini varsayılan adrese kalıcı yazar (null'lar konumu temizler). */
  async setLocation(id: string, input: CompanyLocationInput, actor: AuthContext) {
    await this.get(id, actor);
    const hasCoords = input.latitude != null && input.longitude != null;
    const patch = {
      latitude: input.latitude != null ? String(input.latitude) : null,
      longitude: input.longitude != null ? String(input.longitude) : null,
      locationSource: hasCoords ? input.source : null,
      updatedAt: new Date(),
    };

    const rows = await this.db
      .select({ id: companyAddresses.id, isDefault: companyAddresses.isDefault })
      .from(companyAddresses)
      .where(and(eq(companyAddresses.companyId, id), isNull(companyAddresses.deletedAt)));
    const target = rows.find((r) => r.isDefault) ?? rows[0];

    if (target) {
      await this.db.update(companyAddresses).set(patch).where(eq(companyAddresses.id, target.id));
    } else if (hasCoords) {
      await this.db.insert(companyAddresses).values({
        tenantId: actor.tenantId,
        companyId: id,
        addressType: 'billing',
        country: 'Türkiye',
        isDefault: true,
        isShipping: true,
        isBilling: true,
        latitude: patch.latitude,
        longitude: patch.longitude,
        locationSource: patch.locationSource,
      });
    }

    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'company.location_updated',
      resourceType: 'company',
      resourceId: id,
      newValues: { latitude: patch.latitude, longitude: patch.longitude, locationSource: patch.locationSource },
    });
    return this.get(id, actor);
  }

  async createAccessRequest(companyId: string, input: CompanyAccessRequestInput, actor: AuthContext) {
    const activeDivisionId = actor.activeDivisionId && actor.activeDivisionId !== 'all' ? actor.activeDivisionId : null;
    const requestedDivisionId = resolveAssignedDivision(actor, input.divisionId ?? activeDivisionId);
    if (!requestedDivisionId) {
      throw new ValidationError('Erişim talebi için bölüm seçimi zorunludur', { field: 'divisionId' });
    }
    await this.assertDivision(requestedDivisionId, actor);
    return this.createAccessRequestForDivision(companyId, requestedDivisionId, actor, { note: input.note ?? null });
  }

  private async ensureCompanyTenant(companyId: string, actor: AuthContext) {
    const company = await this.db.query.companies.findFirst({
      where: and(eq(companies.id, companyId), eq(companies.tenantId, actor.tenantId), isNull(companies.deletedAt)),
    });
    if (!company) throw new NotFoundError('Firma');
    return company;
  }

  /**
   * Tenant + role-bazlı (ilişki tipi/durum) görünürlük doğrular; bölüm portföyünü
   * UYGULAMAZ. Bölümler-arası (cross-division) okumalarda kullanılır: kullanıcı
   * firmayı hiç göremiyorsa (ör. saf tedarikçi + satış rolü) 404 döner.
   */
  private async assertCompanyRelationVisible(companyId: string, actor: AuthContext) {
    const filters = [eq(companies.id, companyId), eq(companies.tenantId, actor.tenantId), isNull(companies.deletedAt)];
    const visibility = await companyVisibilityFilter(this.db, actor);
    if (visibility) filters.push(visibility);
    const row = await this.db.query.companies.findFirst({ where: and(...filters) });
    if (!row) throw new NotFoundError('Firma');
    return row;
  }

  private async userIdsInDivision(divisionId: string): Promise<string[]> {
    const rows = await this.db
      .select({ userId: userDivisions.userId })
      .from(userDivisions)
      .where(eq(userDivisions.divisionId, divisionId));
    return rows.map((r) => r.userId);
  }

  private async createAccessRequestForDivision(
    companyId: string,
    requestedDivisionId: string,
    actor: AuthContext,
    options: { note?: string | null }
  ) {
    const company = await this.ensureCompanyTenant(companyId, actor);
    if (await this.hasCompanyDivision(companyId, requestedDivisionId)) {
      return { id: null, status: 'already_granted', companyId, requestingDivisionId: requestedDivisionId };
    }

    const owner = await this.db.query.companyDivisions.findFirst({
      where: and(eq(companyDivisions.companyId, companyId), ne(companyDivisions.divisionId, requestedDivisionId)),
    });
    const existing = await this.db.query.companyAccessRequests.findFirst({
      where: and(
        eq(companyAccessRequests.tenantId, actor.tenantId),
        eq(companyAccessRequests.companyId, companyId),
        eq(companyAccessRequests.requestingDivisionId, requestedDivisionId),
        eq(companyAccessRequests.status, 'pending'),
        isNull(companyAccessRequests.deletedAt)
      ),
    });
    if (existing) return existing;

    const [request] = await this.db
      .insert(companyAccessRequests)
      .values({
        tenantId: actor.tenantId,
        companyId,
        requestingUserId: actor.userId,
        requestingDivisionId: requestedDivisionId,
        ownerDivisionId: owner?.divisionId ?? null,
        note: options.note ?? null,
      })
      .returning();

    const ownerDivision = owner?.divisionId
      ? await this.db.query.divisions.findFirst({ where: eq(divisions.id, owner.divisionId) })
      : null;
    await this.db.insert(notifications).values({
      tenantId: actor.tenantId,
      divisionId: owner?.divisionId ?? null,
      type: 'company_access_request',
      title: 'Mükerrer firma onayı bekliyor',
      body: `${company.legalTitle} için ${ownerDivision?.name ?? 'firma sahibi'} portföyünden erişim talebi var.`,
      entityType: 'company_access_request',
      entityId: request.id,
    });

    return request;
  }

  async listAccessRequests(actor: AuthContext, query: { status?: string }, page: Pagination) {
    const { limit, offset } = pageOffset(page);
    const filters = [eq(companyAccessRequests.tenantId, actor.tenantId), isNull(companyAccessRequests.deletedAt)];
    if (query.status) filters.push(eq(companyAccessRequests.status, query.status));
    const scope = this.scope(actor);
    if (scope.mode === 'list') {
      if (scope.divisionIds.length === 0) {
        filters.push(sql`1 = 0`);
      } else {
        filters.push(
          or(
            inArray(companyAccessRequests.ownerDivisionId, scope.divisionIds),
            inArray(companyAccessRequests.requestingDivisionId, scope.divisionIds)
          )!
        );
      }
    }
    const where = and(...filters);
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(companyAccessRequests)
      .where(where);
    const rows = await this.db
      .select({
        request: companyAccessRequests,
        company: { id: companies.id, legalTitle: companies.legalTitle, taxNumber: companies.taxNumber },
        requestingDivision: { id: divisions.id, name: divisions.name, code: divisions.code },
      })
      .from(companyAccessRequests)
      .innerJoin(companies, eq(companyAccessRequests.companyId, companies.id))
      .leftJoin(divisions, eq(companyAccessRequests.requestingDivisionId, divisions.id))
      .where(where)
      .orderBy(desc(companyAccessRequests.createdAt))
      .limit(limit)
      .offset(offset);
    return buildPaginated(
      rows.map((row) => ({ ...row.request, company: row.company, requestingDivision: row.requestingDivision })),
      count,
      page
    );
  }

  async decideAccessRequest(id: string, decision: 'approved' | 'rejected', input: CompanyAccessRequestDecisionInput, actor: AuthContext) {
    const request = await this.db.query.companyAccessRequests.findFirst({
      where: and(
        eq(companyAccessRequests.id, id),
        eq(companyAccessRequests.tenantId, actor.tenantId),
        isNull(companyAccessRequests.deletedAt)
      ),
    });
    if (!request) throw new NotFoundError('Erişim talebi');
    if (request.status !== 'pending') throw new ConflictError('Bu erişim talebi zaten sonuçlandırılmış');
    const canDecide =
      actor.canViewAllDivisions || (request.ownerDivisionId ? actor.divisionIds.includes(request.ownerDivisionId) : false);
    if (!canDecide) throw new ForbiddenError('Bu erişim talebini sonuçlandıramazsınız');

    await this.db
      .update(companyAccessRequests)
      .set({
        status: decision,
        decisionNote: input.decisionNote ?? null,
        decidedByUserId: actor.userId,
        decidedAt: new Date(),
      })
      .where(eq(companyAccessRequests.id, id));

    if (decision === 'approved') {
      await this.db
        .insert(companyDivisions)
        .values({
          tenantId: actor.tenantId,
          companyId: request.companyId,
          divisionId: request.requestingDivisionId,
          addedByUserId: actor.userId,
        })
        .onConflictDoNothing();
    }

    await this.db.insert(notifications).values({
      tenantId: actor.tenantId,
      userId: request.requestingUserId,
      divisionId: request.requestingDivisionId,
      type: decision === 'approved' ? 'company_access_approved' : 'company_access_rejected',
      title: decision === 'approved' ? 'Firma erişimi onaylandı' : 'Firma erişimi reddedildi',
      body: input.decisionNote ?? null,
      entityType: 'company_access_request',
      entityId: request.id,
    });

    return this.db.query.companyAccessRequests.findFirst({ where: eq(companyAccessRequests.id, id) });
  }

  async crossDivisionDebt(companyId: string, actor: AuthContext) {
    await this.assertCompanyRelationVisible(companyId, actor);
    const scope = this.scope(actor);
    const excludedDivisionIds = scope.mode === 'list' ? scope.divisionIds : actor.divisionIds;
    const filters = [
      eq(receivables.tenantId, actor.tenantId),
      eq(receivables.companyId, companyId),
      isNull(receivables.deletedAt),
      isNotNull(receivables.divisionId),
      or(isNull(paymentStatuses.code), not(inArray(paymentStatuses.code, ['paid', 'cancelled'])))!,
    ];
    if (excludedDivisionIds.length > 0) {
      filters.push(not(inArray(receivables.divisionId, excludedDivisionIds)));
    }
    const rows = await this.db
      .select({
        divisionId: divisions.id,
        name: divisions.name,
        amount: sql<string>`coalesce(sum(${receivables.amount}), 0)`,
      })
      .from(receivables)
      .innerJoin(divisions, eq(receivables.divisionId, divisions.id))
      .leftJoin(paymentStatuses, eq(receivables.statusId, paymentStatuses.id))
      .where(and(...filters))
      .groupBy(divisions.id, divisions.name);

    const canSeeAmount = actor.canViewAllDivisions || actor.roles.includes('super_admin');
    const departments = rows.map((row) => ({
      id: row.divisionId,
      name: row.name,
      ...(canSeeAmount ? { amount: Number(row.amount ?? 0) } : {}),
    }));
    return {
      hasDebt: rows.some((row) => Number(row.amount ?? 0) > 0),
      departments,
      ...(canSeeAmount ? { amount: departments.reduce((sum, row) => sum + (row.amount ?? 0), 0) } : {}),
    };
  }

  async delete(id: string, actor: AuthContext) {
    const existing = await this.get(id, actor);
    const countFor = (value: unknown) => Number((value as { count?: number } | undefined)?.count ?? 0);
    const [
      contactRows,
      opportunityRows,
      activityRows,
      quoteRows,
      orderRows,
      invoiceRows,
      receivableRows,
      paymentRows,
      deviceRows,
      installationRows,
      serviceRows,
      shipmentRows,
      deliveryRows,
    ] = await Promise.all([
      this.db.select({ count: sql<number>`count(*)::int` }).from(contacts).where(and(eq(contacts.tenantId, actor.tenantId), eq(contacts.companyId, id), isNull(contacts.deletedAt))),
      this.db.select({ count: sql<number>`count(*)::int` }).from(opportunities).where(and(eq(opportunities.tenantId, actor.tenantId), eq(opportunities.companyId, id), isNull(opportunities.deletedAt))),
      this.db.select({ count: sql<number>`count(*)::int` }).from(salesActivities).where(and(eq(salesActivities.tenantId, actor.tenantId), eq(salesActivities.companyId, id), isNull(salesActivities.deletedAt))),
      this.db.select({ count: sql<number>`count(*)::int` }).from(quotes).where(and(eq(quotes.tenantId, actor.tenantId), eq(quotes.companyId, id), isNull(quotes.deletedAt))),
      this.db.select({ count: sql<number>`count(*)::int` }).from(salesOrders).where(and(eq(salesOrders.tenantId, actor.tenantId), eq(salesOrders.companyId, id), isNull(salesOrders.deletedAt))),
      this.db.select({ count: sql<number>`count(*)::int` }).from(accountingInvoices).where(and(eq(accountingInvoices.tenantId, actor.tenantId), eq(accountingInvoices.companyId, id), isNull(accountingInvoices.deletedAt))),
      this.db.select({ count: sql<number>`count(*)::int` }).from(receivables).where(and(eq(receivables.tenantId, actor.tenantId), eq(receivables.companyId, id), isNull(receivables.deletedAt))),
      this.db.select({ count: sql<number>`count(*)::int` }).from(payments).where(and(eq(payments.tenantId, actor.tenantId), eq(payments.companyId, id), isNull(payments.deletedAt))),
      this.db.select({ count: sql<number>`count(*)::int` }).from(customerDevices).where(and(eq(customerDevices.tenantId, actor.tenantId), eq(customerDevices.companyId, id), isNull(customerDevices.deletedAt))),
      this.db.select({ count: sql<number>`count(*)::int` }).from(installationJobs).where(and(eq(installationJobs.tenantId, actor.tenantId), eq(installationJobs.companyId, id), isNull(installationJobs.deletedAt))),
      this.db.select({ count: sql<number>`count(*)::int` }).from(serviceTickets).where(and(eq(serviceTickets.tenantId, actor.tenantId), eq(serviceTickets.companyId, id), isNull(serviceTickets.deletedAt))),
      this.db.select({ count: sql<number>`count(*)::int` }).from(shipments).where(and(eq(shipments.tenantId, actor.tenantId), eq(shipments.companyId, id), isNull(shipments.deletedAt))),
      this.db.select({ count: sql<number>`count(*)::int` }).from(deliveries).where(and(eq(deliveries.tenantId, actor.tenantId), eq(deliveries.companyId, id), isNull(deliveries.deletedAt))),
    ]);
    const dependencies = {
      contacts: countFor(contactRows[0]),
      opportunities: countFor(opportunityRows[0]),
      activities: countFor(activityRows[0]),
      quotes: countFor(quoteRows[0]),
      salesOrders: countFor(orderRows[0]),
      invoices: countFor(invoiceRows[0]),
      receivables: countFor(receivableRows[0]),
      payments: countFor(paymentRows[0]),
      machines: countFor(deviceRows[0]),
      installations: countFor(installationRows[0]),
      serviceTickets: countFor(serviceRows[0]),
      shipments: countFor(shipmentRows[0]),
      deliveries: countFor(deliveryRows[0]),
    };
    if (Object.values(dependencies).some((count) => count > 0)) {
      throw new ConflictError(
        'Bu firma geçmiş CRM kayıtlarında kullanılıyor. Silmek yerine durumunu pasif yapın veya kayıtları başka firmayla birleştirin.',
        { dependencies },
      );
    }
    await this.db.update(companies).set({ deletedAt: new Date() }).where(eq(companies.id, id));
    await this.audit.write({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: 'company.deleted',
      resourceType: 'company',
      resourceId: id,
      oldValues: existing,
    });
    return { ok: true };
  }
}
