import React from 'react';
import { companyService } from '../../api/services';
import { Badge, EntityList, ListRow } from '../../ui';

type CompanyListItem = {
  id: string;
  legalTitle: string;
  shortName?: string | null;
  taxNumber?: string | null;
  relationType?: { code: string; name: string } | null;
  customerStatus?: { code: string; name: string } | null;
  primaryPhone?: string | null;
};

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'neutral'> = {
  active: 'ok',
  potential: 'warn',
  passive: 'neutral',
  blacklist: 'danger',
};

export function CompaniesListScreen({ navigation }: { navigation: any }) {
  return (
    <EntityList<CompanyListItem>
      queryKey="companies"
      fetchPage={({ search, page, pageSize }) => companyService.list({ search, page, pageSize }) as Promise<any>}
      keyExtractor={(c) => c.id}
      searchPlaceholder="Firma adı, vergi no…"
      emptyTitle="Firma yok"
      emptySubtitle="Aramayı değiştir ya da yeni firma ekle."
      onCreate={() => navigation.navigate('CompanyForm', {})}
      renderItem={(c) => (
        <ListRow
          title={c.shortName || c.legalTitle}
          subtitle={[c.relationType?.name, c.primaryPhone, c.taxNumber].filter(Boolean).join(' · ') || undefined}
          right={c.customerStatus ? <Badge label={c.customerStatus.name} tone={STATUS_TONE[c.customerStatus.code] ?? 'neutral'} /> : undefined}
          onPress={() => navigation.navigate('CompanyDetail', { id: c.id, title: c.shortName || c.legalTitle })}
        />
      )}
    />
  );
}
