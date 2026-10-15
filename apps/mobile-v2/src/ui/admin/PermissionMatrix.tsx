import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AdminPermission } from '@/src/api/admin.api';
import { chipClass, chipTextClass, toneColor, useTheme } from '@/src/theme/theme';
import { Card, SearchBar } from '@/src/ui';
import {
  ACTION_LABEL,
  PERMISSION_ACTIONS,
  buildPermissionRows,
  filterByText,
  groupState,
  roleResourceLabel,
  toggleGroup,
  togglePermission,
  type GroupState,
} from './admin-model';

const STATE_ICON: Record<GroupState, keyof typeof Ionicons.glyphMap> = {
  all: 'checkbox',
  some: 'remove-circle',
  none: 'square-outline',
};

/**
 * Web yetki matrisinin mobil karşılığı: her kaynak bir kart, aksiyonlar
 * dokunmatik çip. Kaynak başlığı satırı, aksiyon çubuğu sütun seçimini yapar.
 */
export function PermissionMatrix({
  permissions,
  selected,
  onChange,
  readOnly,
}: {
  permissions: AdminPermission[];
  selected: string[];
  onChange: (next: string[]) => void;
  readOnly?: boolean;
}) {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const rows = useMemo(() => buildPermissionRows(permissions), [permissions]);
  const visibleRows = useMemo(
    () => filterByText(rows, query, (row) => [roleResourceLabel(row.resource), row.resource]),
    [rows, query]
  );
  const allCodes = permissions.map((p) => p.code);
  const allState = groupState(selectedSet, allCodes);

  return (
    <View className="gap-3">
      <SearchBar value={query} onChange={setQuery} placeholder="Modül ara..." />
      {!readOnly ? (
        <View className="gap-2">
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel="Tüm yetkiler"
            accessibilityState={{ checked: allState === 'all' ? true : allState === 'some' ? 'mixed' : false }}
            onPress={() => onChange(toggleGroup(selected, allCodes))}
            className="min-h-11 flex-row items-center gap-2 rounded-control border border-border bg-card px-3 active:opacity-70"
          >
            <Ionicons name={STATE_ICON[allState]} size={20} color={allState === 'none' ? colors.mutedForeground : colors.primary} />
            <Text className="font-inter-semibold text-[14px] text-foreground">Tüm yetkiler</Text>
          </Pressable>
          <View className="flex-row flex-wrap gap-2">
            {PERMISSION_ACTIONS.map((action) => {
              const codes = permissions.filter((p) => p.action === action).map((p) => p.code);
              if (!codes.length) return null;
              const state = groupState(selectedSet, codes);
              const tone = state === 'all' ? 'info' : state === 'some' ? 'warning' : 'neutral';
              return (
                <Pressable
                  key={action}
                  accessibilityRole="checkbox"
                  accessibilityLabel={`Tüm modüllerde ${ACTION_LABEL[action]}`}
                  accessibilityState={{ checked: state === 'all' ? true : state === 'some' ? 'mixed' : false }}
                  onPress={() => onChange(toggleGroup(selected, codes))}
                  className={`min-h-11 flex-row items-center gap-1 rounded-full border px-3 ${chipClass[tone]} active:opacity-60`}
                >
                  <Ionicons name={STATE_ICON[state]} size={14} color={toneColor(colors, tone)} />
                  <Text className={`font-inter-medium text-[12px] ${chipTextClass[tone]}`}>{ACTION_LABEL[action]}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {visibleRows.map((row) => {
        const codes = PERMISSION_ACTIONS.map((action) => row.actions[action]?.code).filter((code): code is string => !!code);
        const state = groupState(selectedSet, codes);
        const count = codes.filter((code) => selectedSet.has(code)).length;
        return (
          <Card key={row.resource} className="gap-2.5 p-3">
            <Pressable
              accessibilityRole="checkbox"
              accessibilityLabel={`${roleResourceLabel(row.resource)} tüm aksiyonlar`}
              accessibilityState={{ checked: state === 'all' ? true : state === 'some' ? 'mixed' : false, disabled: readOnly }}
              disabled={readOnly}
              onPress={() => onChange(toggleGroup(selected, codes))}
              className="min-h-11 flex-row items-center gap-2 active:opacity-70"
            >
              <Ionicons name={STATE_ICON[state]} size={20} color={state === 'none' ? colors.mutedForeground : colors.primary} />
              <View className="flex-1">
                <Text className="font-inter-semibold text-[14px] text-foreground">{roleResourceLabel(row.resource)}</Text>
                <Text className="font-inter text-[11px] text-muted-foreground">{row.resource}</Text>
              </View>
              <Text className="font-inter-medium text-[12px] text-muted-foreground">
                {count}/{codes.length}
              </Text>
            </Pressable>
            <View className="flex-row flex-wrap gap-2">
              {PERMISSION_ACTIONS.map((action) => {
                const permission = row.actions[action];
                if (!permission) return null;
                const on = selectedSet.has(permission.code);
                const tone = on ? 'info' : 'neutral';
                return (
                  <Pressable
                    key={action}
                    accessibilityRole="checkbox"
                    accessibilityLabel={`${roleResourceLabel(row.resource)} ${ACTION_LABEL[action]}`}
                    accessibilityState={{ checked: on, disabled: readOnly }}
                    disabled={readOnly}
                    onPress={() => onChange(togglePermission(selected, permission.code))}
                    className={`min-h-11 flex-row items-center gap-1 rounded-full border px-3 ${chipClass[tone]} ${on ? '' : 'opacity-75'} active:opacity-60`}
                  >
                    {on ? <Ionicons name="checkmark" size={14} color={toneColor(colors, 'info')} /> : null}
                    <Text className={`font-inter-medium text-[12px] ${chipTextClass[tone]}`}>{ACTION_LABEL[action]}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>
        );
      })}
    </View>
  );
}
