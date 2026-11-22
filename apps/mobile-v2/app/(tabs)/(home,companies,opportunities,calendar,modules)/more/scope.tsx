import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/src/auth/AuthProvider';
import { scopeOptions, reconcileScope, isScopeCompatible } from '@/src/auth/scope-options';
import { SCOPE_RESOURCE_LABELS } from '@/src/auth/scope-display';
import { Button, DetailHeader } from '@/src/ui';
import { SettingsGroup, SettingsRow } from '@/src/ui/settings';
import { OptionPicker } from '@/src/ui/pickers/OptionPicker';
import { useNavigationBottomInset } from '@/src/ui/LiquidGlassTabBarBackground';

export default function ScopeScreen() {
  const { user, scope, changeScope } = useAuth();
  const { resource: param } = useLocalSearchParams<{ resource?: string }>();
  const router = useRouter();
  const bottom = useNavigationBottomInset();
  const [message, setMessage] = useState('');
  const resources = [...new Set([...Object.keys(SCOPE_RESOURCE_LABELS), ...(user?.accessScopes.map(row => row.resource) ?? [])])]
    .filter(resource => user?.permissions.some(permission => permission.startsWith(`${resource}.`)) || user?.accessScopes.some(row => row.resource === resource));
  const resource = resources.includes(param ?? '') ? param! : resources.includes('opportunities') ? 'opportunities' : resources[0] ?? 'companies';
  const options = user ? scopeOptions(user, scope.departmentId, resource) : null;
  const compatible = user ? isScopeCompatible(user, scope, resource) : false;
  function apply(next: typeof scope) {
    if (!user) return;
    const normalized = reconcileScope(user, next, resource);
    if (!normalized) { setMessage('Bu modül için seçilebilir bölüm bulunmuyor. Yöneticinizden erişim tanımını kontrol etmesini isteyin.'); return; }
    void Haptics.selectionAsync();
    changeScope(normalized, resource);
    setMessage(next.divisionId !== normalized.divisionId ? 'Bölüm, seçtiğiniz departmana uygun olarak güncellendi.' : 'Çalışma alanı güncellendi.');
  }
  return <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
    <DetailHeader title="Bölüm ve departman" compact />
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ width: '100%', maxWidth: 760, alignSelf: 'center', paddingBottom: bottom + 24 }} contentContainerClassName="gap-3 px-4 pt-2">
      <View className="gap-1.5 rounded-surface border border-border bg-card p-3"><Text className="font-inter-semibold text-[15px] text-foreground">Hangi alanda çalışıyorsunuz?</Text><Text className="font-inter text-[13px] leading-[19px] text-muted-foreground">Bölüm iş alanınızı, departman ekip kapsamınızı belirler. Seçenekler modül yetkilerinize göre gösterilir; bu seçim yeni erişim vermez.</Text></View>
      <OptionPicker label="Kapsamı kontrol edilecek modül" value={resource} options={resources.map(value => ({ value, label: SCOPE_RESOURCE_LABELS[value] ?? value.replace(/_/g, ' ') }))} onChange={value => { if (!value) return; setMessage(''); router.setParams({ resource: value }); }} />
      {!compatible && <View className="gap-2 rounded-surface border border-warning bg-warning-soft p-3"><Text className="font-inter text-[13px] leading-5 text-foreground">Mevcut bölüm ve departman bu modülün erişim tanımlarıyla uyuşmuyor. Uygun bir birleşim seçin.</Text><Button label="Bu modül için uygun kapsamı uygula" onPress={() => apply(scope)} /></View>}
      {message ? <Text accessibilityLiveRegion="polite" className="font-inter text-sm text-primary">{message}</Text> : null}
      <SettingsGroup title="1 · Departman">
        {options?.departments.map((department, index) => <SettingsRow key={department.id} first={index === 0} icon={scope.departmentId === department.id ? 'checkmark-circle' : 'ellipse-outline'} tone={scope.departmentId === department.id ? 'success' : 'neutral'} title={department.name} subtitle={department.isPrimary ? 'Varsayılan departman' : department.code} onPress={() => apply({ ...scope, departmentId: department.id })} />)}
        {!options?.departments.length && <Text className="p-4 font-inter text-sm text-muted-foreground">Bu modül için atanmış departman bulunmuyor.</Text>}
      </SettingsGroup>
      <SettingsGroup title="2 · Bölüm">
        {options?.canPickAll && <SettingsRow first icon={scope.divisionId === null ? 'checkmark-circle' : 'ellipse-outline'} tone={scope.divisionId === null ? 'success' : 'neutral'} title="Tüm bölümler" subtitle="Bu modül ve departmanda yetkili tüm bölümler" onPress={() => apply({ ...scope, divisionId: null })} />}
        {options?.legacy && !user?.canViewAllDivisions ? <View className="gap-1 p-4"><Text className="font-inter-medium text-[15px] text-foreground">{options.divisions.map(row => row.name).join(', ') || 'Atanmış bölüm yok'}</Text><Text className="font-inter text-[12px] leading-[18px] text-muted-foreground">Bu modülde atanmış bölümleriniz birlikte listelenir. Tek bölüm filtresi için yöneticinizin modül erişim kapsamını tanımlaması gerekir.</Text></View> : options?.divisions.map((division, index) => <SettingsRow key={division.id} first={!options.canPickAll && index === 0} icon={scope.divisionId === division.id ? 'checkmark-circle' : 'ellipse-outline'} tone={scope.divisionId === division.id ? 'success' : 'neutral'} title={division.name} subtitle={division.isPrimary ? 'Varsayılan bölüm' : division.code} onPress={() => apply({ ...scope, divisionId: division.id })} />)}
        {!options?.available && <Text className="p-4 font-inter text-sm text-muted-foreground">Seçili departman için bölüm bulunamadı.</Text>}
      </SettingsGroup>
      {options?.legacy && <Text className="font-inter text-[12px] leading-[18px] text-muted-foreground">Bu modülde özel kapsam tanımı yok; mevcut atanmış bölüm ve departmanlarınız kullanılır. Son erişim kontrolü sunucuda yapılır.</Text>}
      <Text className="font-inter text-[12px] leading-[18px] text-muted-foreground">Çalışma alanı değiştiğinde eski listeler temizlenir. Kaydetmediğiniz formlar kapanabilir; önce düzenlemenizi tamamlayın.</Text>
    </ScrollView>
  </SafeAreaView>;
}
