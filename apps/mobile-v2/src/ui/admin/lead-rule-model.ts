export type LeadRuleLike = {
  name: string;
  priority: number;
  active: boolean;
  divisionId: string | null;
  criteria: { cities: string[]; productTerms: string[]; sourceCodes: string[] };
  assigneeUserIds: string[];
};

export type LeadRuleForm = {
  name: string;
  priority: string;
  divisionId: string;
  cities: string;
  products: string;
  sources: string;
  assigneeUserIds: string[];
};

export type SalesCandidate = {
  id: string;
  status: string;
  roles: { code: string }[];
  divisions: { id: string }[];
};

export const LEAD_RULE_ALL_DIVISIONS = 'all';

export const csvList = (value: string) => [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];

export function emptyLeadRuleForm(): LeadRuleForm {
  return { name: '', priority: '100', divisionId: LEAD_RULE_ALL_DIVISIONS, cities: '', products: '', sources: '', assigneeUserIds: [] };
}

export function leadRuleToForm(rule: LeadRuleLike): LeadRuleForm {
  return {
    name: rule.name,
    priority: String(rule.priority),
    divisionId: rule.divisionId ?? LEAD_RULE_ALL_DIVISIONS,
    cities: rule.criteria.cities.join(', '),
    products: rule.criteria.productTerms.join(', '),
    sources: rule.criteria.sourceCodes.join(', '),
    assigneeUserIds: rule.assigneeUserIds,
  };
}

export function leadRuleFormToBody(form: LeadRuleForm, active: boolean) {
  return {
    name: form.name.trim(),
    priority: Math.min(10_000, Math.max(0, Math.trunc(Number(form.priority)) || 100)),
    active,
    divisionId: form.divisionId === LEAD_RULE_ALL_DIVISIONS ? null : form.divisionId,
    criteria: {
      cities: csvList(form.cities),
      productTerms: csvList(form.products),
      sourceCodes: csvList(form.sources),
    },
    assigneeUserIds: form.assigneeUserIds,
  };
}

export function leadRuleSummary(rule: LeadRuleLike) {
  return (
    [
      rule.criteria.cities.length ? `Şehir: ${rule.criteria.cities.join(', ')}` : null,
      rule.criteria.productTerms.length ? `Ürün: ${rule.criteria.productTerms.join(', ')}` : null,
      rule.criteria.sourceCodes.length ? `Kaynak: ${rule.criteria.sourceCodes.join(', ')}` : null,
    ]
      .filter(Boolean)
      .join(' · ') || 'Tüm leadler'
  );
}

export function activeSalesUsers<T extends SalesCandidate>(users: T[]) {
  return users.filter((u) => u.status === 'active' && u.roles.some((role) => role.code === 'sales'));
}

export function salesUsersForDivision<T extends SalesCandidate>(sales: T[], divisionId: string) {
  return divisionId === LEAD_RULE_ALL_DIVISIONS ? sales : sales.filter((u) => u.divisions.some((d) => d.id === divisionId));
}

/** Bölüm değişince o bölümde olmayan atanmış kullanıcılar düşer (web ile aynı). */
export function changeLeadRuleDivision<T extends SalesCandidate>(form: LeadRuleForm, divisionId: string, sales: T[]): LeadRuleForm {
  return {
    ...form,
    divisionId,
    assigneeUserIds:
      divisionId === LEAD_RULE_ALL_DIVISIONS
        ? form.assigneeUserIds
        : form.assigneeUserIds.filter((id) => sales.find((u) => u.id === id)?.divisions.some((d) => d.id === divisionId)),
  };
}
