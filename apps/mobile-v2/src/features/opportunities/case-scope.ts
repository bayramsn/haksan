import type { Receivable2 } from '@/src/api/endpoints';

/** Web SalesCaseDetail: `payments.filter(p => p.salesCaseId === sc.id)`.
 * Mobile receivables link via quoteId (payment-plan) or same-company note hint. */
export function receivableBelongsToOpportunity(
  row: Receivable2,
  quoteIds: ReadonlySet<string>,
  opts?: { companyId?: string | null; titleHint?: string | null },
): boolean {
  if (row.quoteId && quoteIds.has(row.quoteId)) return true;
  if (row.quoteId) return false;
  const companyId = opts?.companyId;
  const hint = opts?.titleHint?.trim();
  if (!companyId || !hint || row.companyId !== companyId) return false;
  return Boolean(row.notes?.includes(hint));
}

export function matchesOpportunityOrCompany<T extends { opportunityId?: string | null; companyId?: string | null }>(
  row: T,
  scope: { opportunityId?: string | null; companyId?: string | null },
): boolean {
  if (scope.opportunityId) return row.opportunityId === scope.opportunityId;
  if (scope.companyId) return row.companyId === scope.companyId;
  return true;
}

export function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}
