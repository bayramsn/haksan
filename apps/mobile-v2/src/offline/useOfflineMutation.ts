import { Alert } from 'react-native';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { ApiError, OfflineError, RequestTimeoutError } from '@/src/api/client';
import { enqueue, type CompanyStatusQueuePayload, type MutationKind } from './queue';

type Options<TVars, TData> = {
  /** Çevrimdışı kalırsa kuyruğa bu türle yazılır. */
  kind: MutationKind;
  mutationFn: (vars: TVars) => Promise<TData>;
  /** Kuyruğa yazılacak yük; çoğu zaman `vars`ın kendisi. */
  toPayload: (vars: TVars) => CompanyStatusQueuePayload;
  /**
   * §3.3: arayüzü anında güncelle. Dönen değer yeni önbellek içeriğidir;
   * `undefined` dönerse o anahtar atlanır.
   */
  optimistic?: { keys: QueryKey[]; apply: (previous: unknown, vars: TVars) => unknown };
  /** Başarıdan sonra tazelenecek anahtarlar. */
  invalidate?: QueryKey[];
  onDone?: (data: TData | null, queued: boolean) => void;
};

type Context = { snapshots: [QueryKey, unknown][] };

/**
 * Optimistic UI + rollback + çevrimdışı kuyruk, tek kanca.
 * Ayrım önemli: sunucu *reddederse* geri alınır, ağ *yoksa* geri alınmaz —
 * işlem kuyruğa girer ve arayüz iyimser hâlini korur.
 */
export function useOfflineMutation<TVars, TData>(opts: Options<TVars, TData>) {
  const qc = useQueryClient();

  return useMutation<TData | null, Error, TVars, Context>({
    mutationFn: async (vars) => {
      try {
        return await opts.mutationFn(vars);
      } catch (err) {
        if (err instanceof OfflineError || err instanceof RequestTimeoutError) {
          // Timeout'ta sunucu işlemi tamamlamış olabilir. Aynı operationId
          // kuyrukta korunur; server idempotency kaydı çift uygulamayı önler.
          await enqueue(opts.kind, opts.toPayload(vars));
          return null; // kuyruğa alındı, hata değil
        }
        throw err;
      }
    },

    onMutate: async (vars) => {
      const snapshots: [QueryKey, unknown][] = [];
      for (const key of opts.optimistic?.keys ?? []) {
        // İptal edilmezse uçuştaki bir istek iyimser veriyi ezebilir.
        await qc.cancelQueries({ queryKey: key });
        const previous = qc.getQueryData(key);
        snapshots.push([key, previous]);
        const next = opts.optimistic?.apply(previous, vars);
        if (next !== undefined) qc.setQueryData(key, next);
      }
      return { snapshots };
    },

    onError: (error, _vars, context) => {
      for (const [key, previous] of context?.snapshots ?? []) qc.setQueryData(key, previous);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

      if (error instanceof ApiError && error.isConflict) {
        Alert.alert('Kayıt değişmiş', 'Bu kayıt başkası tarafından güncellenmiş. Yeni halini görmek ister misiniz?', [
          { text: 'Vazgeç', style: 'cancel' },
          { text: 'Yenile', onPress: () => opts.invalidate?.forEach((k) => void qc.invalidateQueries({ queryKey: k })) },
        ]);
        return;
      }
      Alert.alert('İşlem tamamlanamadı', error.message);
    },

    onSuccess: (data) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      opts.onDone?.(data, data === null);
    },

    onSettled: (data) => {
      // Kuyruğa alınmışsa sunucuda henüz bir şey yok; invalidate iyimser veriyi silerdi.
      if (data === null) return;
      for (const key of opts.invalidate ?? []) void qc.invalidateQueries({ queryKey: key });
    },
  });
}
