import { ReactNode } from 'react';
import { Button } from '../ui/button';
import { BrandIllustration, type BrandIllustrationScene } from '../brand';

type Props = {
  icon?: ReactNode;
  /** Verilirse ikon kutusu yerine logo temelli marka illüstrasyonu çizilir. */
  scene?: BrandIllustrationScene;
  title: string;
  description?: string;
  action?: ReactNode;
  eyebrow?: string;
  compact?: boolean;
};

/** Boş liste durumu — illüstrasyon/ikon + başlık + isteğe bağlı CTA. */
export function EmptyState({ icon, scene, title, description, action, eyebrow = "Çalışma alanı hazır", compact = false }: Props) {
  return (
    <div className={`premium-blueprint surface-enter relative flex flex-col items-center justify-center px-6 text-center ${compact ? "py-8" : "py-14"}`}>
      <div className="precision-corners absolute inset-5 opacity-45" aria-hidden />
      {scene ? (
        <BrandIllustration scene={scene} size={compact ? 'sm' : 'md'} className="mb-2" />
      ) : (
        <div className="relative mb-4 grid size-14 place-items-center rounded-xl border border-primary/10 bg-card text-primary shadow-sm after:absolute after:-inset-2 after:-z-10 after:rounded-2xl after:border after:border-dashed after:border-primary/15">
          <span className="grid size-9 place-items-center rounded-lg bg-brand-blue-soft">{icon}</span>
        </div>
      )}
      <div className="mb-1.5 font-data text-[9px] font-semibold uppercase tracking-[0.18em] text-operation-blue">{eyebrow}</div>
      <h3 className="font-display text-lg font-semibold leading-tight text-foreground">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function EmptyStateButton(props: React.ComponentProps<typeof Button>) {
  return <Button size="sm" className="h-9 gap-1" {...props} />;
}
