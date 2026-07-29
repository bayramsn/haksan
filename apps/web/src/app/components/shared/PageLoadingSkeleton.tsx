import { Skeleton } from '../ui/skeleton';
import { GearSpinner } from '../brand';

/** İlk store yüklemesi sırasında boş tablo flaşını önler. */
export function PageLoadingSkeleton() {
  return (
    <div className="surface-enter space-y-4" aria-busy="true" aria-label="Veriler yükleniyor">
      <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <GearSpinner size="sm" label="" className="shrink-0" />
        Veriler hazırlanıyor
        <div className="h-px flex-1 bg-border" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.7fr)]">
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
      <Skeleton className="h-56 rounded-lg" />
    </div>
  );
}
