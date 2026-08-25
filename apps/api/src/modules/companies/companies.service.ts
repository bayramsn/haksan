import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, exists, gte, ilike, inArray, isNotNull, isNull, ne, not, or, sql, type SQL } from 'drizzle-orm';
import type { DbClient } from '../../db/client';
import {
  companies,
  companyStatusOperations,
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
import { competitors, opportunities, salesActivities } from '../../db/schema/crm';
import { deliveries, installationJobs, serviceTickets, shipments } from '../../db/schema/service';
import { divisions } from '../../db/schema/tenants';
import { users, userDivisions } from '../../db/schema/users';
import { activityTypes, companyRelationTypes, companyStatuses, companyGroups, contactSources, fileDocumentTypes, paymentStatuses } from '../../db/schema/lookup';
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
  NearbyStaleVisitCompany,
  NearbyStaleVisitInput,
  CompanyOsmSearchQuery,
  CompanyOsmSearchResult,
  CompanyWebsiteLookupInput,
  CompanyWebsiteLookupResult,
  CompanyUpdateInput,
  CompanyListFilterQuery,
  CompanySummaryQuery,
  CompanyStatusMutationInput,
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
import { PushService } from '../../shared/push/push.service';
import { companyNameKey, companyNameKeySql, normalizeCompanyName } from '../../shared/utils/text-normalization';
import { inspectOfficialCompanyWebsite } from './company-website-lookup';
import { companyLogoPath } from './company-media.service';
import { nextRecordNo } from '../../shared/utils/record-sequence';

const COMPANY_LOGO_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
/** Yakınlık taramasında kutu ön elemesinden sonra JS'e çekilecek azami satır. */
const NEARBY_SCAN_LIMIT = 500;
/** Tek seferde bildirilecek azami firma; saha kullanıcısını boğmamak için. */
const NEARBY_RESULT_LIMIT = 5;
const NEARBY_STALE_VISIT_NOTIFICATION = 'nearby_stale_visit';

/** İki koordinat arası kilometre (haversine). */
const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
};
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
    private readonly audit: AuditService,
    private readonly push: PushService
  ) {}

  private scope(actor: AuthContext): DivisionScope {
    return resolveResourceDivisionScope(actor, 'companies');
  }

  /**
   * Firma liste ve aggregate sorgularının ortak güvenlik sınırı. İstemcinin
   * istediği bölüm yalnızca mevcut resource scope içinde ise ek bir daraltma
   * olarak uygulanır; yetkisiz bir UUID hiçbir zaman kapsamı genişletemez.
   */
  private async visibleCompanyFilters(actor: AuthContext, requestedDivisionId?: string): Promise<SQL[]> {
    const scope = this.scope(actor);
    const filters: SQL[] = [eq(companies.tenantId, actor.tenantId), isNull(companies.deletedAt)];
    const portfolio = companyPortfolioFilter(scope, companies.id);
    if (portfolio) filters.push(portfolio);
    const visibility = await companyVisibilityFilter(this.db, actor);
    if (visibility) filters.push(visibility);

    const requestedDivisionAllowed =
      requestedDivisionId && (scope.mode === 'all' || scope.divisionIds.includes(requestedDivisionId));
    if (requestedDivisionAllowed) {
      filters.push(
        exists(
          this.db
            .select({ companyId: companyDivisions.companyId })
            .from(companyDivisions)
            .where(
              and(
                eq(companyDivisions.companyId, companies.id),
                eq(companyDivisions.tenantId, actor.tenantId),
                eq(companyDivisions.divisionId, requestedDivisionId),
              ),
            ),
        ),
      );
    }
    return filters;
  }

  private async resolveCreateDivisions(input: CompanyCreateInput, actor: AuthContext): Promise<string[]> {
    const requested = Array.from(new Set((input.divisionIds ?? []).filter(Boolean)));
    if (requested.length) {
      for (const divisionId of requested) await this.assertDivision(divisionId, actor);
      return requested;
    }

    const assigned = resolveAssignedResourceDivision(actor, 'companies', input.divisionId ?? null);
    if (assigned) return [(await this.assertDivision(assigned, actor)).id];

    if (input.companyGroupCode && ['cnc', 'universal', 'sac_isleme'].includes(input.companyGroupCode)) {
      const division = await this.db.query.divisions.findFirst({
        where: and(eq(divisions.tenantId, actor.tenantId), eq(divisions.code, input.companyGroupCode)),
      });
      if (division) return [(await this.assertDivision(division.id, actor)).id];
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

  private async resolveContactSourceId(code: string | null | undefined): Promise<string | null> {
    if (!code) return null;
    const sourceId = await lookupIdByCode(this.db, contactSources, code);
    if (!sourceId) {
      throw new ValidationError('Geçersiz irtibat şekli / kaynak seçildi', {
        field: 'contactSourceCode',
        code,
      });
    }
    return sourceId;
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

  async list(actor: AuthContext, query: CompanyListFilterQuery, page: Pagination) {
    const { limit, offset } = pageOffset(page);
    const filters = await this.visibleCompanyFilters(actor, query.divisionId);
    if (query.ids?.length) filters.push(inArray(companies.id, query.ids));
    if (query.search) {
      const pattern = `%${query.search}%`;
      const normalizedSearch = query.search.toLocaleLowerCase('tr-TR');
      const supplierCategoryCodes = [
        { code: 'transportation', label: 'nakliye' },
        { code: 'logistics', label: 'lojistik' },
      ]
        .filter((category) => category.label.includes(normalizedSearch))
        .map((category) => category.code);
      filters.push(
        or(
          ilike(companies.legalTitle, pattern),
          ilike(companies.shortName, pattern),
          ilike(companies.externalCompanyNo, pattern),
          ilike(companies.taxNumber, pattern),
          ilike(companies.sector, pattern),
          ilike(companies.supplierCategoryCode, pattern),
          supplierCategoryCodes.length
            ? inArray(companies.supplierCategoryCode, supplierCategoryCodes)
            : undefined,
          exists(
            this.db
              .select({ id: companyAddresses.id })
              .from(companyAddresses)
              .where(
                and(
                  eq(companyAddresses.companyId, companies.id),
                  eq(companyAddresses.tenantId, actor.tenantId),
                  isNull(companyAddresses.deletedAt),
                  or(
                    ilike(companyAddresses.province, pattern),
                    ilike(companyAddresses.district, pattern),
                  ),
                ),
              ),
          ),
          exists(
            this.db
              .select({ id: companyPhones.id })
              .from(companyPhones)
              .where(
                and(
                  eq(companyPhones.companyId, companies.id),
                  eq(companyPhones.tenantId, actor.tenantId),
                  isNull(companyPhones.deletedAt),
                  ilike(companyPhones.phone, pattern),
                ),
              ),
          ),
          exists(
            this.db
              .select({ id: companyEmails.id })
              .from(companyEmails)
              .where(
                and(
                  eq(companyEmails.companyId, companies.id),
                  eq(companyEmails.tenantId, actor.tenantId),
                  isNull(companyEmails.deletedAt),
                  ilike(companyEmails.email, pattern),
                ),
              ),
          ),
        )!
      );
    }
    if (query.relationTypeCode) {
      const relId = await lookupIdByCode(this.db, companyRelationTypes, query.relationTypeCode);
      filters.push(relId ? eq(companies.relationTypeId, relId) : sql`1 = 0`);
    }
    if (query.customerStatusCode) {
      const sid = await lookupIdByCode(this.db, companyStatuses, query.customerStatusCode);
      filters.push(sid ? eq(companies.customerStatusId, sid) : sql`1 = 0`);
    }
    if (query.city) {
      filters.push(
        exists(
          this.db
            .select({ id: companyAddresses.id })
            .from(companyAddresses)
            .where(
              and(
                eq(companyAddresses.companyId, companies.id),
                eq(companyAddresses.tenantId, actor.tenantId),
                isNull(companyAddresses.deletedAt),
                eq(companyAddresses.province, query.city),
              ),
            ),
        ),
      );
    }
    if (query.sector) filters.push(eq(companies.sector, query.sector));
    if (query.supplierCategoryCode) {
      filters.push(eq(companies.supplierCategoryCode, query.supplierCategoryCode));
    }

    const where = and(...filters);
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(companies)
      .where(where);

    const sortColumn = page.sortBy === 'name' ? companies.legalTitle : companies.createdAt;
    const orderBy = page.sortDir === 'asc'
      ? [asc(sortColumn), asc(companies.id)]
      : [desc(sortColumn), desc(companies.id)];
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
      .orderBy(...orderBy)
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

  async summary(actor: AuthContext, query: CompanySummaryQuery) {
    const filters = await this.visibleCompanyFilters(actor, query.divisionId);
    const where = and(...filters);
    const [totalRows, relationRows, statusRows, cityRows, sectorRows] = await Promise.all([
      this.db
        .select({ total: sql<number>`count(*)::int` })
        .from(companies)
        .where(where),
      this.db
        .select({ code: companyRelationTypes.code, count: sql<number>`count(*)::int` })
        .from(companies)
        .innerJoin(companyRelationTypes, eq(companies.relationTypeId, companyRelationTypes.id))
        .where(where)
        .groupBy(companyRelationTypes.code),
      this.db
        .select({ code: companyStatuses.code, count: sql<number>`count(*)::int` })
        .from(companies)
        .innerJoin(companyStatuses, eq(companies.customerStatusId, companyStatuses.id))
        .where(where)
        .groupBy(companyStatuses.code),
      this.db
        .selectDistinct({ value: companyAddresses.province })
        .from(companyAddresses)
        .innerJoin(companies, eq(companyAddresses.companyId, companies.id))
        .where(
          and(
            ...filters,
            eq(companyAddresses.tenantId, actor.tenantId),
            isNull(companyAddresses.deletedAt),
            isNotNull(companyAddresses.province),
            ne(companyAddresses.province, ''),
          ),
        )
        .orderBy(asc(companyAddresses.province)),
      this.db
        .selectDistinct({ value: companies.sector })
        .from(companies)
        .where(and(...filters, isNotNull(companies.sector), ne(companies.sector, '')))
        .orderBy(asc(companies.sector)),
    ]);

    const byRelation: Record<string, number> = {
      customer: 0,
      supplier: 0,
      supplier_customer: 0,
      competitor: 0,
    };
    for (const row of relationRows) byRelation[row.code] = row.count;
    const byStatus: Record<string, number> = {
      potential: 0,
      active: 0,
      passive: 0,
      blacklist: 0,
    };
    for (const row of statusRows) byStatus[row.code] = row.count;

    return {
      total: totalRows[0]?.total ?? 0,
      byRelation,
      byStatus,
      cities: cityRows.map((row) => row.value).filter((value): value is string => Boolean(value)),
      sectors: sectorRows.map((row) => row.value).filter((value): value is string => Boolean(value)),
    };
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

  /**
   * Mükerrer firma kaydını reddeder. Kayıt başka bir bölümün portföyündeyse
   * kullanıcı onu göremediği için körlemesine ikinci kez açmasın diye erişim
   * talebi üretilir; kendi bölümündeyse doğrudan çakışma döner.
   *
   * Eşzamanlı istekler `create` içindeki danışma kilidiyle serileştirilir.
   *
   * ponytail: kalıcı çözüm (tenant_id, ünvan anahtarı) üzerinde kısmi unique
   * index olurdu; mevcut mükerrer kayıtlar temizlenmeden migration patlayacağı
   * için şimdilik uygulama katmanında.
   */
  private async rejectDuplicateCompany(
    match: SQL,
    sameDivisionMessage: string,
    otherDivisionMessage: string,
    primaryDivisionId: string,
    actor: AuthContext,
    note: string | null,
  ) {
    const existing = await this.db.query.companies.findFirst({
      where: and(eq(companies.tenantId, actor.tenantId), isNull(companies.deletedAt), match),
    });
    if (!existing) return;
    if (await this.hasCompanyDivision(existing.id, primaryDivisionId)) {
      throw new ConflictError(`${sameDivisionMessage}: ${existing.legalTitle}`, {
        duplicateCompanyId: existing.id,
      });
    }
    const request = await this.createAccessRequestForDivision(existing.id, primaryDivisionId, actor, { note });
    throw new ConflictError(`${otherDivisionMessage}: ${existing.legalTitle}`, {
      duplicateCompanyId: existing.id,
      accessRequestId: request.id,
      status: request.status,
    });
  }

  async create(input: CompanyCreateInput, actor: AuthContext) {
    const divisionIds = await this.resolveCreateDivisions(input, actor);
    const primaryDivisionId = divisionIds[0];
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
      await this.rejectDuplicateCompany(
        eq(companies.taxNumber, input.taxNumber),
        'Bu vergi numarası ile bir firma zaten kayıtlı',
        'Bu vergi numarası başka bir bölüm portföyünde kayıtlı; erişim talebi oluşturuldu',
        primaryDivisionId,
        actor,
        input.notes ?? null,
      );
    }
    // Vergi numarası girilmeyen firmalar (lead/potansiyel) aynı ünvanla defalarca
    // açılabiliyordu; ünvan anahtarı bu mükerrer kaydı da kapatır.
    const nameKey = companyNameKey(input.legalTitle);
    if (nameKey) {
      await this.rejectDuplicateCompany(
        sql`${companyNameKeySql(companies.legalTitle)} = ${nameKey}`,
        'Bu ünvanla bir firma zaten kayıtlı',
        'Bu ünvanla bir firma başka bir bölüm portföyünde kayıtlı; erişim talebi oluşturuldu',
        primaryDivisionId,
        actor,
        input.notes ?? null,
      );
    }

    const selectedGroupCodes = input.companyGroupCodes ?? (input.companyGroupCode ? [input.companyGroupCode] : []);
    const selectedGroups = await this.resolveCompanyGroups(selectedGroupCodes);
    const externalCompanyNo = input.externalCompanyNo ?? await nextRecordNo(this.db, actor.tenantId, 'company');
    const [relId, statusId, sourceId] = await Promise.all([
      lookupIdByCode(this.db, companyRelationTypes, input.relationTypeCode),
      lookupIdByCode(this.db, companyStatuses, input.customerStatusCode),
      this.resolveContactSourceId(input.contactSourceCode),
    ]);
    if (!relId) {
      throw new ValidationError('Geçersiz firma ilişki türü seçildi', {
        field: 'relationTypeCode',
        code: input.relationTypeCode,
      });
    }
    if (!statusId) {
      throw new ValidationError('Geçersiz firma durumu seçildi', {
        field: 'customerStatusCode',
        code: input.customerStatusCode,
      });
    }

    let created: typeof companies.$inferSelect;
    try {
      created = await this.db.transaction(async (tx) => {
        // Çift tıklama / yeniden gönderim iki isteği aynı anda buraya sokabiliyor;
        // ikisi de yukarıdaki kontrolü geçer. Ünvan anahtarı üzerinde işlem ömürlü
        // danışma kilidi alıp kontrolü kilit altında tekrarlıyoruz: ikinci istek
        // birincinin commit'ini görür ve çakışma döner. Vergi numarasında bu gerekmez,
        // orada kısmi unique index zaten var.
        if (nameKey) {
          await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${actor.tenantId}:${nameKey}`}, 0))`);
          const raced = await tx.query.companies.findFirst({
            where: and(
              eq(companies.tenantId, actor.tenantId),
              isNull(companies.deletedAt),
              sql`${companyNameKeySql(companies.legalTitle)} = ${nameKey}`,
            ),
          });
          if (raced) {
            throw new ConflictError(`Bu ünvanla bir firma zaten kayıtlı: ${raced.legalTitle}`, {
              duplicateCompanyId: raced.id,
            });
          }
        }

        const [company] = await tx
          .insert(companies)
          .values({
            tenantId: actor.tenantId,
            externalCompanyNo,
            companyType: input.companyType,
            relationTypeId: relId,
            customerStatusId: statusId,
            companyGroupId: selectedGroups[0]?.id ?? null,
            contactSourceId: sourceId,
            contactSourceText: input.contactSourceText ?? null,
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

        // Firma kartındaki "Rakip" seçimi LOST penceresinin kullandığı rakip
        // kataloğuna aynı transaction içinde yansır; kısmi kayıt oluşmaz.
        if (input.relationTypeCode === 'competitor') {
          const competitorName = company.shortName || company.legalTitle;
          const legacyCompetitor = await tx.query.competitors.findFirst({
            where: and(
              eq(competitors.tenantId, actor.tenantId),
              isNull(competitors.companyId),
              isNull(competitors.deletedAt),
              sql`lower(trim(${competitors.name})) = lower(trim(${competitorName}))`,
            ),
          });
          if (legacyCompetitor) {
            await tx
              .update(competitors)
              .set({ companyId: company.id, name: competitorName, website: company.website, notes: company.notes })
              .where(eq(competitors.id, legacyCompetitor.id));
          } else {
            await tx.insert(competitors).values({
              tenantId: actor.tenantId,
              companyId: company.id,
              name: competitorName,
              website: company.website,
              notes: company.notes,
            });
          }
        }

        await tx.insert(companyDivisions).values(
          divisionIds.map((divisionId) => ({
            tenantId: actor.tenantId,
            companyId: company.id,
            divisionId,
            addedByUserId: actor.userId,
          }))
        ).onConflictDoNothing();

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
      if (error instanceof ConflictError) throw error;
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

    if (input.legalTitle && companyNameKey(input.legalTitle) !== companyNameKey(existing.legalTitle)) {
      const duplicate = await this.db.query.companies.findFirst({
        where: and(
          eq(companies.tenantId, actor.tenantId),
          isNull(companies.deletedAt),
          ne(companies.id, id),
          sql`${companyNameKeySql(companies.legalTitle)} = ${companyNameKey(input.legalTitle)}`,
        ),
      });
      if (duplicate) {
        throw new ConflictError(`Bu ünvanla bir firma zaten kayıtlı: ${duplicate.legalTitle}`, {
          duplicateCompanyId: duplicate.id,
        });
      }
    }

    const groupSelectionProvided = input.companyGroupCodes !== undefined || input.companyGroupCode !== undefined;
    const contactSourceSelectionProvided = input.contactSourceCode !== undefined || input.contactSourceText !== undefined;
    const selectedGroupCodes = input.companyGroupCodes ?? (input.companyGroupCode ? [input.companyGroupCode] : []);
    const selectedGroups = groupSelectionProvided ? await this.resolveCompanyGroups(selectedGroupCodes) : [];
    const [relId, statusId, sourceId] = await Promise.all([
      lookupIdByCode(this.db, companyRelationTypes, input.relationTypeCode),
      lookupIdByCode(this.db, companyStatuses, input.customerStatusCode),
      this.resolveContactSourceId(input.contactSourceCode),
    ]);
    if (input.relationTypeCode !== undefined && !relId) {
      throw new ValidationError('Geçersiz firma ilişki türü seçildi', {
        field: 'relationTypeCode',
        code: input.relationTypeCode,
      });
    }
    if (input.customerStatusCode !== undefined && !statusId) {
      throw new ValidationError('Geçersiz firma durumu seçildi', {
        field: 'customerStatusCode',
        code: input.customerStatusCode,
      });
    }
    const competitorRelationId = await lookupIdByCode(this.db, companyRelationTypes, 'competitor');
    const shouldBeCompetitor = input.relationTypeCode !== undefined
      ? input.relationTypeCode === 'competitor'
      : existing.relationTypeId === competitorRelationId;

    const patch: Record<string, unknown> = {
      updatedBy: actor.userId,
    };
    if (input.companyType !== undefined) patch.companyType = input.companyType;
    if (input.logoFileId !== undefined) patch.logoFileId = input.logoFileId;
    if (input.externalCompanyNo !== undefined) patch.externalCompanyNo = input.externalCompanyNo;
    if (input.relationTypeCode !== undefined) patch.relationTypeId = relId;
    if (input.customerStatusCode !== undefined) patch.customerStatusId = statusId;
    if (groupSelectionProvided) patch.companyGroupId = selectedGroups[0]?.id ?? null;
    if (contactSourceSelectionProvided) {
      patch.contactSourceId = sourceId;
      patch.contactSourceText = input.contactSourceText ?? null;
    }
    for (const k of ['sector', 'supplierCategoryCode', 'legalTitle', 'shortName', 'taxOffice', 'taxNumber', 'website', 'notes'] as const) {
      if ((input as any)[k] === undefined) continue;
      const value = (input as any)[k];
      patch[k] = (k === 'legalTitle' || k === 'shortName') && value
        ? normalizeCompanyName(value)
        : value ?? null;
    }

    await this.db.transaction(async (tx) => {
      await tx.update(companies).set(patch).where(eq(companies.id, id));

      const competitorRecord = await tx.query.competitors.findFirst({
        where: and(eq(competitors.tenantId, actor.tenantId), eq(competitors.companyId, id)),
      });
      if (shouldBeCompetitor) {
        const nextLegalTitle = input.legalTitle ? normalizeCompanyName(input.legalTitle) : existing.legalTitle;
        const nextShortName = input.shortName !== undefined
          ? input.shortName ? normalizeCompanyName(input.shortName) : null
          : existing.shortName;
        const competitorPatch = {
          name: nextShortName || nextLegalTitle,
          website: input.website !== undefined ? input.website ?? null : existing.website,
          notes: input.notes !== undefined ? input.notes ?? null : existing.notes,
          deletedAt: null,
        };
        if (competitorRecord) {
          await tx.update(competitors).set(competitorPatch).where(eq(competitors.id, competitorRecord.id));
        } else {
          const legacyCompetitor = await tx.query.competitors.findFirst({
            where: and(
              eq(competitors.tenantId, actor.tenantId),
              isNull(competitors.companyId),
              isNull(competitors.deletedAt),
              sql`lower(trim(${competitors.name})) = lower(trim(${competitorPatch.name}))`,
            ),
          });
          if (legacyCompetitor) {
            await tx
              .update(competitors)
              .set({ companyId: id, ...competitorPatch })
              .where(eq(competitors.id, legacyCompetitor.id));
          } else {
            await tx.insert(competitors).values({
              tenantId: actor.tenantId,
              companyId: id,
              ...competitorPatch,
            });
          }
        }
      } else if (competitorRecord && !competitorRecord.deletedAt) {
        await tx.update(competitors).set({ deletedAt: new Date() }).where(eq(competitors.id, competitorRecord.id));
      }

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

  /**
   * Dar mobil durum mutasyonu: aynı operationId aynı kullanıcı+tenant altında
   * en fazla bir kez uygulanır. Ağ yanıtı kaybolduğunda güvenli replay sağlar.
   */
  async updateStatus(id: string, input: CompanyStatusMutationInput, actor: AuthContext) {
    const existing = await this.get(id, actor);
    const statusId = await lookupIdByCode(this.db, companyStatuses, input.customerStatusCode);
    if (!statusId) {
      throw new ValidationError('Geçersiz firma durumu seçildi', {
        field: 'customerStatusCode',
        code: input.customerStatusCode,
      });
    }

    const changed = await this.db.transaction(async (tx) => {
      const [claimed] = await tx
        .insert(companyStatusOperations)
        .values({
          tenantId: actor.tenantId,
          userId: actor.userId,
          operationId: input.operationId,
          companyId: id,
          statusCode: input.customerStatusCode,
        })
        .onConflictDoNothing({
          target: [
            companyStatusOperations.tenantId,
            companyStatusOperations.userId,
            companyStatusOperations.operationId,
          ],
        })
        .returning({ operationId: companyStatusOperations.operationId });

      if (!claimed) {
        const [prior] = await tx
          .select({
            companyId: companyStatusOperations.companyId,
            statusCode: companyStatusOperations.statusCode,
          })
          .from(companyStatusOperations)
          .where(and(
            eq(companyStatusOperations.tenantId, actor.tenantId),
            eq(companyStatusOperations.userId, actor.userId),
            eq(companyStatusOperations.operationId, input.operationId),
          ))
          .limit(1);
        if (!prior || prior.companyId !== id || prior.statusCode !== input.customerStatusCode) {
          throw new ConflictError('İşlem kimliği farklı bir durum değişikliği için zaten kullanılmış');
        }
        return false;
      }

      if (existing.customerStatusId === statusId) return false;
      await tx
        .update(companies)
        .set({ customerStatusId: statusId, updatedBy: actor.userId })
        .where(and(eq(companies.id, id), eq(companies.tenantId, actor.tenantId), isNull(companies.deletedAt)));
      return true;
    });

    if (changed) {
      await this.audit.write({
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: 'company.status_updated',
        resourceType: 'company',
        resourceId: id,
        oldValues: { customerStatusId: existing.customerStatusId },
        newValues: { customerStatusCode: input.customerStatusCode, operationId: input.operationId },
      });
    }
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

  /**
   * Saha hatırlatması: kullanıcının anlık konumuna `radiusKm` içinde olup son
   * `staleDays` gündür ziyaret edilmemiş firmaları döner ve (notify ise) her biri
   * için günde bir kez bildirim + push üretir.
   *
   * Yalnızca varsayılan adresinde koordinat kayıtlı firmalar değerlendirilir;
   * il/ilçe merkezine düşen yaklaşık konumlar "yakınımdasın" demek için yeterince
   * doğru değil. Ziyaret ölçütü `customer_visit` tipi aktivitedir.
   */
  async nearbyStaleVisits(input: NearbyStaleVisitInput, actor: AuthContext) {
    const staleBefore = new Date(Date.now() - input.staleDays * 24 * 60 * 60 * 1000);

    // Kaba ön eleme: yarıçapı çevreleyen kutu. Kesin mesafe aşağıda haversine ile.
    const latDelta = input.radiusKm / 111.32;
    const cosLat = Math.max(Math.cos((input.latitude * Math.PI) / 180), 0.01);
    const lngDelta = input.radiusKm / (111.32 * cosLat);
    const inBoundingBox = and(
      isNotNull(companyAddresses.latitude),
      isNotNull(companyAddresses.longitude),
      sql`${companyAddresses.latitude} between ${input.latitude - latDelta} and ${input.latitude + latDelta}`,
      sql`${companyAddresses.longitude} between ${input.longitude - lngDelta} and ${input.longitude + lngDelta}`,
    )!;

    const filters = await this.visibleCompanyFilters(actor);
    filters.push(
      exists(
        this.db
          .select({ id: companyAddresses.id })
          .from(companyAddresses)
          .where(
            and(
              eq(companyAddresses.companyId, companies.id),
              eq(companyAddresses.tenantId, actor.tenantId),
              isNull(companyAddresses.deletedAt),
              inBoundingBox,
            ),
          ),
      ),
    );

    const companyRows = await this.db
      .select({ id: companies.id, legalTitle: companies.legalTitle, shortName: companies.shortName })
      .from(companies)
      .where(and(...filters))
      .limit(NEARBY_SCAN_LIMIT);
    if (companyRows.length === 0) {
      return { staleDays: input.staleDays, radiusKm: input.radiusKm, companies: [] as NearbyStaleVisitCompany[] };
    }
    const companyIds = companyRows.map((row) => row.id);

    // Konum: firmanın koordinatı olan varsayılan (yoksa ilk) adresi.
    const addressRows = await this.db
      .select({
        companyId: companyAddresses.companyId,
        latitude: companyAddresses.latitude,
        longitude: companyAddresses.longitude,
        province: companyAddresses.province,
        district: companyAddresses.district,
      })
      .from(companyAddresses)
      .where(
        and(
          inArray(companyAddresses.companyId, companyIds),
          eq(companyAddresses.tenantId, actor.tenantId),
          isNull(companyAddresses.deletedAt),
          isNotNull(companyAddresses.latitude),
          isNotNull(companyAddresses.longitude),
        ),
      )
      .orderBy(desc(companyAddresses.isDefault), asc(companyAddresses.id));
    const addressByCompany = new Map<string, (typeof addressRows)[number]>();
    for (const row of addressRows) if (!addressByCompany.has(row.companyId)) addressByCompany.set(row.companyId, row);

    // Ziyaret tipi iki kodla kaydedilmiş olabilir: güncel `customer_visit` ve
    // lookup migration'ı öncesi yazılan eski `visit`. İkisi de sayılmazsa eski
    // ziyaretler görünmez olur ve firma haksız yere "hiç uğranmadı" sayılır.
    const visitTypeRows = await this.db
      .select({ id: activityTypes.id })
      .from(activityTypes)
      .where(inArray(activityTypes.code, ['customer_visit', 'visit']));
    const lastVisitByCompany = new Map<string, Date>();
    if (visitTypeRows.length > 0) {
      const visitRows = await this.db
        .select({
          companyId: salesActivities.companyId,
          lastVisitAt: sql<string | null>`max(${salesActivities.activityDate})`,
        })
        .from(salesActivities)
        .where(
          and(
            eq(salesActivities.tenantId, actor.tenantId),
            isNull(salesActivities.deletedAt),
            inArray(salesActivities.companyId, companyIds),
            inArray(
              salesActivities.activityTypeId,
              visitTypeRows.map((row) => row.id),
            ),
          ),
        )
        .groupBy(salesActivities.companyId);
      for (const row of visitRows) {
        if (row.companyId && row.lastVisitAt) lastVisitByCompany.set(row.companyId, new Date(row.lastVisitAt));
      }
    }

    const nearby: NearbyStaleVisitCompany[] = [];
    for (const row of companyRows) {
      const address = addressByCompany.get(row.id);
      const latitude = Number(address?.latitude);
      const longitude = Number(address?.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
      const distanceKm = haversineKm(input.latitude, input.longitude, latitude, longitude);
      if (distanceKm > input.radiusKm) continue;
      const lastVisitAt = lastVisitByCompany.get(row.id) ?? null;
      if (lastVisitAt && lastVisitAt >= staleBefore) continue;
      nearby.push({
        id: row.id,
        name: row.shortName || row.legalTitle,
        city: address?.province ?? null,
        district: address?.district ?? null,
        latitude,
        longitude,
        distanceKm: Math.round(distanceKm * 10) / 10,
        lastVisitAt: lastVisitAt ? lastVisitAt.toISOString() : null,
        daysSinceVisit: lastVisitAt
          ? Math.floor((Date.now() - lastVisitAt.getTime()) / (24 * 60 * 60 * 1000))
          : null,
      });
    }
    nearby.sort((a, b) => a.distanceKm - b.distanceKm);
    const result = nearby.slice(0, NEARBY_RESULT_LIMIT);
    if (input.notify) await this.notifyNearbyStaleVisits(result, input.staleDays, actor);
    return { staleDays: input.staleDays, radiusKm: input.radiusKm, companies: result };
  }

  /**
   * Aynı firma için 24 saatte bir kez, yanıtlanana kadar kapanmayan ziyaret
   * sorusu + push üretir. Açık bir soru 24 saati aşsa da mükerrer yazılmaz.
   */
  private async notifyNearbyStaleVisits(
    rows: NearbyStaleVisitCompany[],
    staleDays: number,
    actor: AuthContext,
  ): Promise<void> {
    if (rows.length === 0) return;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const alreadySent = await this.db
      .select({ entityId: notifications.entityId })
      .from(notifications)
      .where(
        and(
          eq(notifications.tenantId, actor.tenantId),
          eq(notifications.userId, actor.userId),
          eq(notifications.type, NEARBY_STALE_VISIT_NOTIFICATION),
          inArray(notifications.entityId, rows.map((row) => row.id)),
          or(gte(notifications.createdAt, since), eq(notifications.actionStatus, 'pending')),
        ),
      );
    const sent = new Set(alreadySent.map((row) => row.entityId));
    const pending = rows.filter((row) => !sent.has(row.id));
    if (pending.length === 0) return;

    await this.db.insert(notifications).values(
      pending.map((row) => ({
        tenantId: actor.tenantId,
        userId: actor.userId,
        type: NEARBY_STALE_VISIT_NOTIFICATION,
        title: `Yakınınızda: ${row.name}`,
        body: `${row.distanceKm} km uzaklıkta${row.city ? ` · ${row.city}` : ''}. ${
          row.daysSinceVisit == null ? 'Hiç ziyaret kaydı yok' : `${row.daysSinceVisit} gündür uğranmadı`
        } (eşik ${staleDays} gün). Bu firmaya gidecek misiniz?`,
        entityType: 'company',
        entityId: row.id,
        actionType: 'visit_intent',
        actionStatus: 'pending',
      })),
    );

    const first = pending[0];
    await this.push.sendToUser(actor.userId, {
      title: pending.length === 1 ? `Yakınınızda: ${first.name}` : `Yakınınızda ${pending.length} firma`,
      body:
        pending.length === 1
          ? `${first.distanceKm} km uzaklıkta · ${first.daysSinceVisit == null ? 'hiç ziyaret edilmemiş' : `${first.daysSinceVisit} gündür uğranmamış`}. Gidecek misiniz?`
          : `${staleDays}+ gündür uğranmayan ${pending.length} firma yakınınızda. En yakını: ${first.name} (${first.distanceKm} km).`,
      data: { kind: 'company', companyId: first.id },
    });
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
    const deletedAt = new Date();
    await this.db.transaction(async (tx) => {
      await tx.update(companies).set({ deletedAt }).where(eq(companies.id, id));
      await tx
        .update(competitors)
        .set({ deletedAt })
        .where(and(eq(competitors.tenantId, actor.tenantId), eq(competitors.companyId, id), isNull(competitors.deletedAt)));
    });
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

  /** Harita için yalnız görünür firmaların tek varsayılan koordinatını döndürür. */
  async mapPoints(actor: AuthContext) {
    const visible = await this.visibleCompanyFilters(actor);
    const rankedAddresses = this.db
      .select({
        companyId: companyAddresses.companyId,
        latitude: companyAddresses.latitude,
        longitude: companyAddresses.longitude,
        province: companyAddresses.province,
        district: companyAddresses.district,
        locationSource: companyAddresses.locationSource,
        rn: sql<number>`row_number() over (partition by ${companyAddresses.companyId} order by ${companyAddresses.isDefault} desc, ${companyAddresses.id} asc)`.as('rn'),
      })
      .from(companyAddresses)
      .where(
        and(
          eq(companyAddresses.tenantId, actor.tenantId),
          isNull(companyAddresses.deletedAt),
          isNotNull(companyAddresses.latitude),
          isNotNull(companyAddresses.longitude),
        ),
      )
      .as('map_address');

    const rows = await this.db
      .select({
        id: companies.id,
        legalTitle: companies.legalTitle,
        shortName: companies.shortName,
        relationTypeCode: companyRelationTypes.code,
        statusCode: companyStatuses.code,
        latitude: rankedAddresses.latitude,
        longitude: rankedAddresses.longitude,
        province: rankedAddresses.province,
        district: rankedAddresses.district,
        locationSource: rankedAddresses.locationSource,
      })
      .from(companies)
      .innerJoin(rankedAddresses, and(eq(rankedAddresses.companyId, companies.id), eq(rankedAddresses.rn, 1)))
      .leftJoin(companyRelationTypes, eq(companies.relationTypeId, companyRelationTypes.id))
      .leftJoin(companyStatuses, eq(companies.customerStatusId, companyStatuses.id))
      .where(and(...visible))
      .orderBy(asc(companies.legalTitle))
      .limit(2001);

    return {
      data: rows.slice(0, 2000).map((row) => ({
        ...row,
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
      })),
      truncated: rows.length > 2000,
    };
  }
}
