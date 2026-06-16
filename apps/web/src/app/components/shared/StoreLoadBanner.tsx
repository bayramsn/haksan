import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import { useStore } from '../../lib/store';
import { Button } from '../ui/button';

/** Kısmi API yükleme hatalarını kalıcı banner ile gösterir. */
export function StoreLoadBanner() {
  const { loadErrors, clearLoadErrors, refresh } = useStore();
  if (!loadErrors.length) return null;

  return (
    <div
      role="alert"
      className="mb-4 flex flex-col gap-3 rounded-lg border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-2 min-w-0">
        <AlertTriangle className="size-4 shrink-0 mt-0.5 text-amber-700" aria-hidden />
        <div className="min-w-0">
          <div className="font-medium">Bazı veriler yüklenemedi</div>
          <ul className="mt-1 text-xs text-amber-900/80 list-disc ml-4 space-y-0.5">
            {loadErrors.map((e) => (
              <li key={e} className="truncate">{e}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1 border-amber-300 bg-white"
          onClick={() => {
            clearLoadErrors();
            void refresh();
          }}
        >
          <RefreshCw className="size-3.5" /> Yeniden dene
        </Button>
        <Button size="icon" variant="ghost" className="size-8" aria-label="Uyarıyı kapat" onClick={clearLoadErrors}>
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}
