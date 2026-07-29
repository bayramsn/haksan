import { gearOutline } from './gear';
import { cn } from '../ui/utils';

type Props = {
  density?: 'sparse' | 'rich';
  className?: string;
};

const G14 = gearOutline(14, 48, 40, 24);
const G10 = gearOutline(10, 48, 38, 18);

function Gear({ path, className, opacity }: { path: string; className: string; opacity: number }) {
  return (
    <svg viewBox="-52 -52 104 104" className={className} style={{ opacity }} aria-hidden="true">
      <path d={path} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}

/**
 * Dekoratif dişli dokusu — rengi ebeveynden alır (currentColor).
 * Koyu panelde `text-white`, açık yüzeyde `text-brand-blue` ver.
 */
export function GearPattern({ density = 'sparse', className }: Props) {
  return (
    <div className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)} aria-hidden="true">
      <Gear path={G14} className="absolute -bottom-16 -right-14 size-56" opacity={0.07} />
      <Gear path={G10} className="absolute -left-10 top-8 size-36" opacity={0.05} />
      {density === 'rich' && (
        <>
          <Gear path={G10} className="absolute right-[18%] -top-8 size-24" opacity={0.05} />
          <Gear path={G14} className="absolute bottom-[22%] left-[30%] size-16" opacity={0.04} />
        </>
      )}
    </div>
  );
}
