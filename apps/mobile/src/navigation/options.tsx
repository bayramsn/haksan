import React from 'react';
import { DivisionSwitcher } from './DivisionSwitcher';
import { colors } from '../ui/theme';

/** Tüm native-stack'lerin ortak header seçenekleri (sağda bölüm seçici). */
export const stackScreenOptions = {
  headerStyle: { backgroundColor: colors.bg },
  headerShadowVisible: false,
  headerTintColor: colors.text,
  headerRight: () => <DivisionSwitcher />,
} as const;
