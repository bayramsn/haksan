import type { TrelloCompanyCandidate } from '@haksan/shared';

export type TrelloMatchCompany = {
  id: string;
  legalTitle: string;
  shortName?: string | null;
  taxNumber?: string | null;
  website?: string | null;
  primaryPhone?: string | null;
  secondaryPhone?: string | null;
  primaryEmail?: string | null;
  secondaryEmail?: string | null;
  province?: string | null;
  district?: string | null;
};

export type TrelloCompanyMatch = TrelloMatchCompany & {
  score: number;
  confidence: 'strong' | 'possible';
  reasons: string[];
};

const compact = (value?: string | null) => value?.trim().replace(/\s+/gu, ' ') || '';

export const normalizeTrelloMatchText = (value?: string | null) =>
  compact(value)
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/\b(a\.?\s*ş\.?|anonim|limited|ltd\.?|şti\.?|şirketi|sanayi|san\.?|ticaret|tic\.?|ve)\b/giu, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const normalizeTrelloPhone = (value?: string | null) => {
  const digits = compact(value).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('90') && digits.length === 12) return digits.slice(2);
  if (digits.startsWith('0') && digits.length === 11) return digits.slice(1);
  return digits;
};

const normalizeEmail = (value?: string | null) => compact(value).toLocaleLowerCase('en-US');

const safeDomain = (value?: string | null) => {
  const text = compact(value);
  if (!text) return '';
  try {
    const url = new URL(text.includes('://') ? text : `https://${text}`);
    return url.hostname.toLocaleLowerCase('en-US').replace(/^www\./, '');
  } catch {
    return text.includes('@') ? text.split('@').pop()?.toLocaleLowerCase('en-US') ?? '' : '';
  }
};

const tokens = (value?: string | null) =>
  new Set(normalizeTrelloMatchText(value).split(' ').filter((token) => token.length > 1));

const diceSimilarity = (left?: string | null, right?: string | null) => {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return (2 * shared) / (a.size + b.size);
};

const extractEmail = (description: string) =>
  description.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0]?.slice(0, 254);

const extractPhone = (description: string) => {
  const candidates = description.match(/(?:\+?90[\s().-]*)?(?:0?5\d{2}|0?[2-4]\d{2})[\s().-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}/g) ?? [];
  return candidates.map(compact).find((value) => normalizeTrelloPhone(value).length >= 10)?.slice(0, 32);
};

const extractWebsite = (description: string) => {
  const urls = description.match(/https?:\/\/[^\s<>()\[\]]+/gi) ?? [];
  return urls.find((value) => !/trello\.com/i.test(value))?.replace(/[),.;]+$/, '').slice(0, 512);
};

const extractTaxNumber = (description: string) =>
  description.match(/\b(?:vkn|vergi\s*(?:no|numarası))\s*[:=-]?\s*(\d{10,11})\b/i)?.[1];

/**
 * Trello kartını hiçbir CRM kaydına dokunmadan düzenlenebilir bir firma
 * adayına dönüştürür. Başlığın "/" veya "·" öncesi firma, sonrası konum
 * ipucudur; açıklamadan yalnız açık biçimli iletişim değerleri çıkarılır.
 */
export function extractTrelloCompanyCandidate(
  title: string,
  description?: string | null
): TrelloCompanyCandidate {
  const cleanTitle = compact(title).slice(0, 255);
  const separator = cleanTitle.search(/[\/·|]/);
  const companyTitle = compact(separator >= 0 ? cleanTitle.slice(0, separator) : cleanTitle).slice(0, 255);
  const locationHint = compact(separator >= 0 ? cleanTitle.slice(separator + 1) : '').slice(0, 160);
  const source = compact(description);
  const email = extractEmail(source);
  const phone = extractPhone(source);
  const website = extractWebsite(source);
  const taxNumber = extractTaxNumber(source);

  let contactName = source
    .split(/\r?\n/, 1)[0]
    ?.replace(email ?? '', ' ')
    .replace(phone ?? '', ' ')
    .replace(website ?? '', ' ')
    .replace(companyTitle, ' ')
    .replace(/\[[^\]]*]/g, ' ')
    .replace(/[|;,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!contactName || contactName.length < 3 || contactName.length > 80 || /\d/.test(contactName)) {
    contactName = '';
  }

  return {
    companyTitle: companyTitle || cleanTitle || 'BİLİNMEYEN FİRMA',
    ...(locationHint ? { locationHint, province: locationHint.slice(0, 64) } : {}),
    ...(contactName ? { contactName: contactName.slice(0, 255) } : {}),
    ...(phone ? { phone } : {}),
    ...(email ? { email } : {}),
    ...(website ? { website } : {}),
    ...(taxNumber ? { taxNumber } : {}),
  };
}

export function scoreTrelloCompanyCandidate(
  candidate: TrelloCompanyCandidate,
  company: TrelloMatchCompany
): TrelloCompanyMatch | null {
  let identityScore = 0;
  const reasons: string[] = [];
  const candidateEmail = normalizeEmail(candidate.email);
  const emails = [company.primaryEmail, company.secondaryEmail].map(normalizeEmail).filter(Boolean);
  const candidatePhone = normalizeTrelloPhone(candidate.phone);
  const phones = [company.primaryPhone, company.secondaryPhone].map(normalizeTrelloPhone).filter(Boolean);
  const candidateName = normalizeTrelloMatchText(candidate.companyTitle);
  const legalName = normalizeTrelloMatchText(company.legalTitle);
  const shortName = normalizeTrelloMatchText(company.shortName);

  if (candidate.taxNumber && company.taxNumber && candidate.taxNumber === company.taxNumber) {
    identityScore = 100;
    reasons.push('Vergi numarası aynı');
  }
  if (candidateEmail && emails.includes(candidateEmail) && identityScore < 95) {
    identityScore = 95;
    reasons.push('E-posta aynı');
  }
  if (candidatePhone && phones.includes(candidatePhone) && identityScore < 90) {
    identityScore = 90;
    reasons.push('Telefon aynı');
  }
  if (candidateName && (candidateName === legalName || candidateName === shortName) && identityScore < 80) {
    identityScore = 80;
    reasons.push('Firma ünvanı aynı');
  }

  const candidateDomain = safeDomain(candidate.website || candidate.email);
  const companyDomain = safeDomain(company.website || company.primaryEmail || company.secondaryEmail);
  if (candidateDomain && companyDomain && candidateDomain === companyDomain && identityScore < 75) {
    identityScore = 75;
    reasons.push('Web/e-posta alan adı aynı');
  }

  const similarity = Math.max(
    diceSimilarity(candidate.companyTitle, company.legalTitle),
    diceSimilarity(candidate.companyTitle, company.shortName)
  );
  const fuzzyScore = Math.round(similarity * 60);
  if (fuzzyScore > identityScore) {
    identityScore = fuzzyScore;
    if (fuzzyScore >= 30) reasons.push(`Firma adı %${Math.round(similarity * 100)} benzer`);
  }

  let score = identityScore;
  if (
    candidate.province &&
    company.province &&
    normalizeTrelloMatchText(candidate.province) === normalizeTrelloMatchText(company.province)
  ) {
    score += 10;
    reasons.push('İl aynı');
  }
  if (
    candidate.district &&
    company.district &&
    normalizeTrelloMatchText(candidate.district) === normalizeTrelloMatchText(company.district)
  ) {
    score += 10;
    reasons.push('İlçe aynı');
  }
  score = Math.min(100, score);
  if (score < 60) return null;
  return {
    ...company,
    score,
    confidence: score >= 80 ? 'strong' : 'possible',
    reasons: Array.from(new Set(reasons)),
  };
}
