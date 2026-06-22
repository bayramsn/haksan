import React from 'react';
import { contactService } from '../../api/services';
import { EntityList, ListRow } from '../../ui';

type ContactListItem = {
  id: string;
  fullName: string;
  title?: string | null;
  department?: string | null;
  mobilePhone?: string | null;
  workPhone?: string | null;
  company?: { id: string; legalTitle: string; shortName?: string | null } | null;
};

export function ContactsListScreen({ navigation }: { navigation: any }) {
  return (
    <EntityList<ContactListItem>
      queryKey="contacts"
      fetchPage={({ search, page, pageSize }) => contactService.list({ search, page, pageSize }) as Promise<any>}
      keyExtractor={(c) => c.id}
      searchPlaceholder="Kişi adı…"
      emptyTitle="Kontak yok"
      onCreate={() => navigation.navigate('ContactForm', {})}
      renderItem={(c) => (
        <ListRow
          title={c.fullName}
          subtitle={
            [c.title, c.company?.shortName || c.company?.legalTitle, c.mobilePhone || c.workPhone].filter(Boolean).join(' · ') || undefined
          }
          onPress={() => navigation.navigate('ContactDetail', { id: c.id, title: c.fullName })}
        />
      )}
    />
  );
}
