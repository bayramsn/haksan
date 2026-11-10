import { useMemo, useState } from 'react';
import { SectionList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import { useCompanyList } from '@/src/api/companies.hooks';
import { useContactList, useOpportunityList, useQuoteList } from '@/src/api/crm.hooks';
import { useInventoryList } from '@/src/api/inventory.hooks';
import { useServiceTickets } from '@/src/api/operations.hooks';
import { useDebouncedValue } from '@/src/lib/useDebouncedValue';
import { useCanAccessModule } from '@/src/modules/useModuleAccess';
import {
  companySearchHit,
  contactSearchHit,
  FIELD_SEARCH_SECTIONS,
  fieldSearchQuery,
  opportunitySearchHit,
  quoteSearchHit,
  serviceSearchHit,
  stockSearchHit,
  type FieldSearchHit,
  type FieldSearchKind,
} from '@/src/features/field-search';
import { useNavigationBottomInset } from '@/src/ui/LiquidGlassTabBarBackground';
import { EmptyState, ErrorState, ListRow, Loading, ScreenHeader, SearchBar } from '@/src/ui';

const ICONS: Record<FieldSearchKind, 'business-outline' | 'person-outline' | 'briefcase-outline' | 'document-text-outline' | 'cube-outline' | 'construct-outline'> = {
  company: 'business-outline',
  contact: 'person-outline',
  opportunity: 'briefcase-outline',
  quote: 'document-text-outline',
  stock: 'cube-outline',
  service: 'construct-outline',
};

export default function FieldSearchScreen() {
  const bottom = useNavigationBottomInset();
  const router = useRouter();
  const [raw, setRaw] = useState('');
  const query = fieldSearchQuery(useDebouncedValue(raw));
  const companiesOn = useCanAccessModule('companies');
  const contactsOn = useCanAccessModule('contacts');
  const opportunitiesOn = useCanAccessModule('opportunities');
  const quotesOn = useCanAccessModule('quotes');
  const stockOn = useCanAccessModule('inventory');
  const serviceOn = useCanAccessModule('service-tickets');
  const enabled = Boolean(query);

  const companies = useCompanyList({ search: query ?? undefined, sortBy: 'name', sortDir: 'asc' }, enabled && companiesOn);
  const contacts = useContactList({ search: query ?? undefined, sortBy: 'name', sortDir: 'asc' }, enabled && contactsOn);
  const opportunities = useOpportunityList({ search: query ?? undefined, view: 'all' }, enabled && opportunitiesOn);
  const quotes = useQuoteList({ search: query ?? undefined }, enabled && quotesOn);
  const stock = useInventoryList({ search: query ?? undefined }, enabled && stockOn);
  const service = useServiceTickets({ search: query ?? undefined }, enabled && serviceOn);

  const sources = useMemo(() => ({
    company: { on: companiesOn, query: companies, hits: (companies.data?.items ?? []).map(companySearchHit) },
    contact: { on: contactsOn, query: contacts, hits: (contacts.data?.items ?? []).map(contactSearchHit) },
    opportunity: { on: opportunitiesOn, query: opportunities, hits: (opportunities.data?.items ?? []).map(opportunitySearchHit) },
    quote: { on: quotesOn, query: quotes, hits: (quotes.data?.items ?? []).map(quoteSearchHit) },
    stock: { on: stockOn, query: stock, hits: (stock.data?.items ?? []).map(stockSearchHit) },
    service: { on: serviceOn, query: service, hits: (service.data?.items ?? []).map(serviceSearchHit) },
  }), [companies, companiesOn, contacts, contactsOn, opportunities, opportunitiesOn, quotes, quotesOn, service, serviceOn, stock, stockOn]);

  const sections = FIELD_SEARCH_SECTIONS
    .filter((section) => sources[section.kind].on)
    .map((section) => ({ ...section, data: sources[section.kind].hits }))
    .filter((section) => section.data.length > 0);

  const pending = enabled && Object.values(sources).some((source) => source.on && source.query.isPending);
  const failed = Object.values(sources).find((source) => source.on && source.query.error);
  const open = (hit: FieldSearchHit) => router.push(hit.href as Href);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <ScreenHeader title="Ara" subtitle="Firma, kontak, fırsat, teklif, stok ve servis" hideBell />
      <View className="pb-2">
        <SearchBar value={raw} onChange={setRaw} placeholder="Ad, telefon, belge no veya seri no" />
      </View>
      {!enabled ? (
        <EmptyState title="Ne arıyorsunuz?" hint="En az iki karakter yazın. Sonuçlar yetkiniz olan kayıtlardan gelir." icon="search-outline" />
      ) : pending && sections.length === 0 ? (
        <Loading />
      ) : failed && sections.length === 0 ? (
        <ErrorState message={failed.query.error?.message ?? 'Arama tamamlanamadı.'} onRetry={() => void failed.query.refetch()} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => `${item.kind}-${item.id}`}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottom + 24, flexGrow: 1 }}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <Text className="pb-1 pt-4 font-display-semibold text-[16px] text-foreground">{section.title}</Text>
          )}
          renderItem={({ item }) => (
            <ListRow title={item.title} lines={[item.subtitle || null]} icon={ICONS[item.kind]} iconTone="info" onPress={() => open(item)} />
          )}
          ListEmptyComponent={<EmptyState title="Kayıt bulunamadı" hint="Farklı bir ad, telefon veya seri numarası deneyin." icon="search-outline" />}
        />
      )}
    </SafeAreaView>
  );
}
