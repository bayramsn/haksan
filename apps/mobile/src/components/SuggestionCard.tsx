import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { CallAssistantAction } from '@haksan/shared';
import type { CallSuggestion } from '../api/client';

type Props = {
  suggestion: CallSuggestion;
  busyAction?: CallAssistantAction | null;
  onAction: (action: CallAssistantAction) => void;
};

export function SuggestionCard({ suggestion, busyAction, onAction }: Props) {
  const companyName = suggestion.company.shortName || suggestion.company.legalTitle;
  const eventLabel = suggestion.event.eventType === 'missed' ? 'Kaçan arama' : 'Arama bitti';
  const detail = [eventLabel, suggestion.contact?.fullName, suggestion.event.normalizedPhone]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{companyName}</Text>
      <Text style={styles.detail}>{detail}</Text>
      {suggestion.body ? <Text style={styles.body}>{suggestion.body}</Text> : null}
      <View style={styles.actions}>
        {suggestion.availableActions.createQuote ? (
          <ActionButton
            label="Teklif"
            action="create_quote"
            busyAction={busyAction}
            onPress={onAction}
          />
        ) : null}
        {suggestion.availableActions.createServiceTicket ? (
          <ActionButton
            label="Servis"
            action="create_service_ticket"
            busyAction={busyAction}
            onPress={onAction}
          />
        ) : null}
        {suggestion.availableActions.logCall ? (
          <ActionButton label="Arama kaydı" action="log_call" busyAction={busyAction} onPress={onAction} />
        ) : null}
        <ActionButton label="Yoksay" action="dismiss" busyAction={busyAction} onPress={onAction} variant="ghost" />
      </View>
    </View>
  );
}

function ActionButton({
  label,
  action,
  busyAction,
  onPress,
  variant = 'primary',
}: {
  label: string;
  action: CallAssistantAction;
  busyAction?: CallAssistantAction | null;
  onPress: (action: CallAssistantAction) => void;
  variant?: 'primary' | 'ghost';
}) {
  const busy = busyAction === action;
  return (
    <TouchableOpacity
      disabled={!!busyAction}
      style={[styles.actionButton, variant === 'ghost' && styles.ghostButton]}
      onPress={() => onPress(action)}
    >
      {busy ? <ActivityIndicator color={variant === 'ghost' ? '#334155' : '#ffffff'} /> : <Text style={[styles.actionText, variant === 'ghost' && styles.ghostText]}>{label}</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    gap: 6,
  },
  title: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '700',
  },
  detail: {
    color: '#475569',
    fontSize: 13,
    lineHeight: 18,
  },
  body: {
    color: '#64748b',
    fontSize: 12,
    lineHeight: 17,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  actionButton: {
    minHeight: 36,
    borderRadius: 8,
    backgroundColor: '#0f172a',
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostButton: {
    backgroundColor: '#f1f5f9',
  },
  actionText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  ghostText: {
    color: '#334155',
  },
});
