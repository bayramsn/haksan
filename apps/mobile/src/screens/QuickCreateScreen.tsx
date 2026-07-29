import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { QuickCreateBackdrop, QuickCreateSheet } from '@/src/ui/quick-create/QuickCreateWidgets';

/** Stitch #09 Hızlı Oluştur — `2c320b06c6a248d2bdd542e5a56380bd` */
export function QuickCreateScreen() {
  const dismiss = () => router.back();

  const openAction = (route: string) => {
    router.replace(route as never);
  };

  return (
    <View style={styles.root}>
      <QuickCreateBackdrop onPress={dismiss} />
      <QuickCreateSheet onClose={dismiss} onCancel={dismiss} onAction={openAction} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
});
