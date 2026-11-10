/** Saha aramasının saf eşlemesi. Her kaynak kendi liste ucunun ilk sayfasından gelir. */

export const FIELD_SEARCH_MIN_LENGTH = 2;

export const FIELD_SEARCH_SECTIONS = [
  { kind: 'company', title: 'Firmalar' },
  { kind: 'contact', title: 'Kontaklar' },
  { kind: 'opportunity', title: 'Fırsatlar' },
  { kind: 'quote', title: 'Teklifler' },
  { kind: 'stock', title: 'Stok' },
  { kind: 'service', title: 'Servis' },
] as const;

export type FieldSearchKind = (typeof FIELD_SEARCH_SECTIONS)[number]['kind'];

export type FieldSearchHit = {
  kind: FieldSearchKind;
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

export function fieldSearchQuery(raw: string): string | null {
  const query = raw.trim();
  return query.length >= FIELD_SEARCH_MIN_LENGTH ? query : null;
}

function joinParts(parts: Array<string | null | undefined>): string {
  return parts.map((part) => part?.trim()).filter(Boolean).join(' · ');
}

export function companySearchHit(item: {
  id: string;
  legalTitle: string;
  shortName: string | null;
  primaryPhone: string | null;
  primaryAddress: { province: string | null; district: string | null } | null;
}): FieldSearchHit {
  return {
    kind: 'company',
    id: item.id,
    title: item.shortName?.trim() || item.legalTitle,
    subtitle: joinParts([
      item.shortName ? item.legalTitle : null,
      [item.primaryAddress?.district, item.primaryAddress?.province].filter(Boolean).join(' / '),
      item.primaryPhone,
    ]),
    href: `/modules/companies/${item.id}`,
  };
}

export function contactSearchHit(item: {
  id: string;
  fullName: string;
  title: string | null;
  mobilePhone: string | null;
  workPhone: string | null;
  company: { legalTitle: string; shortName: string | null } | null;
}): FieldSearchHit {
  return {
    kind: 'contact',
    id: item.id,
    title: item.fullName,
    subtitle: joinParts([item.company?.shortName ?? item.company?.legalTitle, item.title, item.mobilePhone ?? item.workPhone]),
    href: `/modules/contacts/${item.id}`,
  };
}

export function opportunitySearchHit(item: {
  id: string;
  title: string;
  requestedMachine: string | null;
  company: { legalTitle: string; shortName: string | null } | null;
  stage: { name: string } | null;
}): FieldSearchHit {
  return {
    kind: 'opportunity',
    id: item.id,
    title: item.title,
    subtitle: joinParts([item.company?.shortName ?? item.company?.legalTitle, item.stage?.name, item.requestedMachine]),
    href: `/modules/opportunities/${item.id}`,
  };
}

export function quoteSearchHit(item: {
  id: string;
  documentNo: string;
  revisionNo: number;
  productName: string | null;
  company: { legalTitle: string; shortName: string | null } | null;
  status: { name: string } | null;
}): FieldSearchHit {
  return {
    kind: 'quote',
    id: item.id,
    title: item.revisionNo > 0 ? `${item.documentNo} R${item.revisionNo}` : item.documentNo,
    subtitle: joinParts([item.company?.shortName ?? item.company?.legalTitle, item.productName, item.status?.name]),
    href: `/modules/quotes/${item.id}`,
  };
}

export function stockSearchHit(item: {
  id: string;
  serialNumber: string;
  product: { fullName: string; modelCode: string } | null;
  brand: { name: string } | null;
  status: { name: string } | null;
  warehouse: { name: string } | null;
}): FieldSearchHit {
  return {
    kind: 'stock',
    id: item.id,
    title: item.serialNumber,
    subtitle: joinParts([item.brand?.name, item.product?.fullName || item.product?.modelCode, item.status?.name, item.warehouse?.name]),
    href: `/modules/inventory/${item.id}`,
  };
}

export function serviceSearchHit(item: {
  id: string;
  ticketNo: string;
  subject: string;
  company: { legalTitle: string; shortName: string | null } | null;
  customerDevice?: { brand: string | null; model: string | null; serialNumber: string | null } | null;
}): FieldSearchHit {
  const machine = [item.customerDevice?.brand, item.customerDevice?.model, item.customerDevice?.serialNumber].filter(Boolean).join(' ');
  return {
    kind: 'service',
    id: item.id,
    title: item.ticketNo,
    subtitle: joinParts([item.company?.shortName ?? item.company?.legalTitle, item.subject, machine || null]),
    href: `/modules/service-tickets/${item.id}`,
  };
}
