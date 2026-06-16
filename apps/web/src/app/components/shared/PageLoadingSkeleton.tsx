import { Skeleton } from '../ui/skeleton';

/** İlk store yüklemesi sırasında boş tablo flaşını önler. */
export function PageLoadingSkeleton() {
  return (
    <div className="space-y-5 animate-in fade-in duration-300" aria-busy="true" aria-label="Veriler yükleniyor">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
      <Skeleton className="h-80 rounded-xl" />
    </div>
  );
}
