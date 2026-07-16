import { useEffect, useState } from 'react';
import { getModuleConfig } from '@/src/modules/registry';
import { serviceService } from '@/src/api/services';
import { normalizeList } from '@/src/modules/registry';

export function useDetailRecord(navKey: string, id: string) {
  const config = getModuleConfig(navKey);
  // Dinamik API kaydı — iç içe alanlara (ör. company.name) erişim için `any` değer tipi.
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        let res: Record<string, any>;
        if (navKey === 'service-requests' || navKey === 'service-kanban') {
          const list = await serviceService.tickets({ page: 1, pageSize: 300 });
          const found = normalizeList(list).find((r) => String(r.id) === id);
          if (!found) throw new Error('Servis talebi bulunamadı');
          res = found;
        } else if (navKey === 'deliveries') {
          const list = await serviceService.deliveries({ page: 1, pageSize: 300 });
          const found = normalizeList(list).find((r) => String(r.id) === id);
          if (!found) throw new Error('Teslimat bulunamadı');
          res = found;
        } else if (navKey === 'installations') {
          const list = await serviceService.installations({ page: 1, pageSize: 300 });
          const found = normalizeList(list).find((r) => String(r.id) === id);
          if (!found) throw new Error('Kurulum bulunamadı');
          res = found;
        } else if (!config?.fetchOne) {
          throw new Error('Detay API yok');
        } else {
          res = await config.fetchOne(id);
        }
        setData(res);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Detay yüklenemedi');
      } finally {
        setLoading(false);
      }
    })();
  }, [config, id, navKey]);

  return { data, loading, error, config };
}
