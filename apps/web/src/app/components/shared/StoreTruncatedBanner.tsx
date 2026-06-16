import { Info } from 'lucide-react';
import { useStore } from '../../lib/store';

/** pageSize sınırına takılan modüller için bilgi bandı. */
export function StoreTruncatedBanner() {
  const { loadTruncated } = useStore();
  if (!loadTruncated.length) return null;

  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-950"
    >
      <Info className="size-4 shrink-0 mt-0.5" aria-hidden />
      <div>
        <div className="font-medium">Liste sınırı (200 kayıt)</div>
        <p className="mt-0.5 text-xs text-blue-900/80">
          {loadTruncated.join(' · ')} — daha fazla kayıt için filtre veya arama kullanın.
        </p>
      </div>
    </div>
  );
}
