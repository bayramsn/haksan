import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getModuleConfig } from '@/src/modules/registry';
import { serviceService } from '@/src/api/services';
import { normalizeList } from '@/src/modules/registry';

export function useDetailRecord(navKey: string, id: string) {
  const config = getModuleConfig(navKey);
  // Dinamik API kaydı — iç içe alanlara (ör. company.name) erişim için `any` değer tipi.
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true); setError(null); setData(null);
    void (async () => {
      try {
        let res: Record<string, any>;
        if (navKey === 'service-requests' || navKey === 'service-kanban') {
          res = await serviceService.ticket(id);
        } else if (navKey === 'deliveries') {
          let found: Record<string, unknown> | undefined;
          for (let page = 1; ; page++) {
            const list = await serviceService.deliveries({ page, pageSize: 100 });
            const rows = normalizeList(list);
            found = rows.find((r) => String(r.id) === id);
            if (found || rows.length < 100) break;
          }
          if (!found) throw new Error('Teslimat bulunamadı');
          res = found;
        } else if (navKey === 'installations') {
          res = await serviceService.installation(id);
        } else if (!config?.fetchOne) {
          throw new Error('Detay API yok');
        } else {
          res = await config.fetchOne(id);
        }
        if (active) setData(res);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Detay yüklenemedi');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [config, id, navKey]));

  return { data, loading, error, config };
}
