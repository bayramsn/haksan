import { ReactNode } from 'react';
import { StoreLoadBanner } from './StoreLoadBanner';
import { StoreTruncatedBanner } from './StoreTruncatedBanner';

/** Sayfa gövdesi: hata / truncation banner + içerik. */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-0">
      <StoreLoadBanner />
      <StoreTruncatedBanner />
      {children}
    </div>
  );
}
