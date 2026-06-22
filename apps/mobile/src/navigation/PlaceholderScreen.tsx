import React from 'react';
import { Screen, Card, SectionTitle, Muted } from '../ui';

/** Henüz yazılmamış modüller için geçici ekran (sonraki fazlarda gerçek ekranla değişir). */
export function PlaceholderScreen({ route }: { route: { params?: { title?: string } } }) {
  const title = route.params?.title ?? 'Modül';
  return (
    <Screen>
      <Card>
        <SectionTitle>{title}</SectionTitle>
        <Muted>Bu modül mobilde yakında. Web CRM ile tam entegre olarak sonraki fazda eklenecek.</Muted>
      </Card>
    </Screen>
  );
}
