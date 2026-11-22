import { Pressable, Text } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/src/auth/AuthProvider';
import { isScopeCompatible, scopeOptions } from '@/src/auth/scope-options';
import { scopeResourceForPath } from '@/src/auth/scope-display';
import { useTheme } from '@/src/theme/theme';

/** The selection is a filter, never an authorization grant. Tek kapsamı olan kullanıcıda seçilecek bir şey yok; çip gizlenir. */
export function ScopeSummary() {
  const { user, scope } = useAuth();
  const pathname = usePathname(), router = useRouter();
  const { colors } = useTheme();
  if (!user || pathname.includes('/more/scope')) return null;
  const resource = scopeResourceForPath(pathname);
  const options = resource ? scopeOptions(user, scope.departmentId, resource) : null;
  const compatible = !resource || isScopeCompatible(user, scope, resource);
  const single = !(options?.canPickAll ?? user.canViewAllDivisions)
    && (options?.divisions ?? user.divisions).length <= 1 && (options?.departments ?? user.departments).length <= 1;
  if (single && compatible) return null;
  const assigned = options?.legacy && !user.canViewAllDivisions;
  const division = assigned ? user.divisions.map(row => row.name).join(', ') || 'Atanmış bölüm yok' : user.divisions.find(row => row.id === scope.divisionId)?.name
    ?? (scope.divisionId ? 'Bölüm seçimi gerekli' : options?.canPickAll ? 'Tüm bölümler' : 'Yetkili bölüm kapsamı');
  const department = user.departments.find(row => row.id === scope.departmentId)?.name ?? 'Departman kapsamı';
  return <Pressable accessibilityRole="button" accessibilityLabel={`Çalışma alanı: bölüm ${division}, departman ${department}. ${compatible ? 'Değiştir' : 'Bu modül için uygun kapsamı seçin'}`}
    onPress={() => router.push({ pathname: '/more/scope', params: resource ? { resource } : {} } as never)} hitSlop={10}
    className={`mt-1 max-w-full flex-row items-center gap-1.5 self-start rounded-full border px-2.5 py-1 active:opacity-70 ${compatible ? 'border-border bg-card' : 'border-warning bg-warning-soft'}`}>
    <Ionicons name={compatible ? 'layers-outline' : 'alert-circle-outline'} size={13} color={compatible ? colors.primary : colors.warning} />
    <Text className="shrink font-inter-medium text-[12px] leading-[16px] text-foreground" numberOfLines={1}>
      {division} · {department}{compatible ? '' : ' · Düzenle'}
    </Text>
    <Ionicons name="chevron-down" size={12} color={colors.mutedForeground} />
  </Pressable>;
}
