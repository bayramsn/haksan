import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/src/auth/AuthProvider';
import { DetailHeader } from '@/src/ui';
import { SettingsGroup, SettingsRow } from '@/src/ui/settings';

export default function ScopeScreen() {
  const { user, scope, changeScope } = useAuth();

  const selectDivision = (divisionId: string | null) => {
    void Haptics.selectionAsync();
    changeScope({ ...scope, divisionId });
  };

  const selectDepartment = (departmentId: string | null) => {
    void Haptics.selectionAsync();
    changeScope({ ...scope, departmentId });
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <DetailHeader title="Çalışma Alanı" />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="gap-5 px-4 pb-12 pt-4"
      >
        <Text selectable className="font-inter text-sm leading-5 text-muted-foreground">
          Seçiminiz tüm liste, rapor ve işlem isteklerine bölüm/departman kapsamı olarak eklenir.
        </Text>

        <SettingsGroup title="Bölüm">
          {user?.canViewAllDivisions ? (
            <SettingsRow
              first
              icon={scope.divisionId === null ? 'checkmark-circle' : 'ellipse-outline'}
              tone={scope.divisionId === null ? 'success' : 'neutral'}
              title="Tüm bölümler"
              onPress={() => selectDivision(null)}
            />
          ) : null}
          {(user?.divisions ?? []).map((division, index) => (
            <SettingsRow
              key={division.id}
              first={!user?.canViewAllDivisions && index === 0}
              icon={scope.divisionId === division.id ? 'checkmark-circle' : 'ellipse-outline'}
              tone={scope.divisionId === division.id ? 'success' : 'neutral'}
              title={division.name}
              subtitle={division.isPrimary ? 'Varsayılan bölüm' : division.code}
              onPress={() => selectDivision(division.id)}
            />
          ))}
        </SettingsGroup>

        <SettingsGroup title="Departman">
          {(user?.departments ?? []).map((department, index) => (
            <SettingsRow
              key={department.id}
              first={index === 0}
              icon={scope.departmentId === department.id ? 'checkmark-circle' : 'ellipse-outline'}
              tone={scope.departmentId === department.id ? 'success' : 'neutral'}
              title={department.name}
              subtitle={department.isPrimary ? 'Varsayılan departman' : department.code}
              onPress={() => selectDepartment(department.id)}
            />
          ))}
          {(user?.departments?.length ?? 0) === 0 ? (
            <View className="px-4 py-5">
              <Text selectable className="font-inter text-sm text-muted-foreground">
                Kullanıcınıza atanmış departman bulunmuyor.
              </Text>
            </View>
          ) : null}
        </SettingsGroup>
      </ScrollView>
    </SafeAreaView>
  );
}
