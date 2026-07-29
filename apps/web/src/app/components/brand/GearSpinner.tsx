import { gearOutline } from './gear';
import { cn } from '../ui/utils';

type Props = {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  className?: string;
};

const BIG = gearOutline(12, 48, 38, 16);
const SMALL = gearOutline(8, 30, 22, 9);

const SIZES = { sm: 'size-6', md: 'size-9', lg: 'size-14' } as const;

/** Birbirine geçmiş iki dişliyle dönen yükleme göstergesi. */
export function GearSpinner({ size = 'md', label = 'Yükleniyor', className }: Props) {
  return (
    <span role="status" className={cn('relative inline-block text-primary', SIZES[size], className)}>
      <svg viewBox="-52 -52 104 104" className="absolute left-0 top-0 h-[72%] w-[72%] animate-[spin_2.6s_linear_infinite]" aria-hidden="true">
        <path d={BIG} fill="currentColor" fillRule="evenodd" />
      </svg>
      <svg viewBox="-34 -34 68 68" className="absolute bottom-0 right-0 h-[46%] w-[46%] animate-[spin_1.7s_linear_infinite_reverse] text-brand-red" aria-hidden="true">
        <path d={SMALL} fill="currentColor" fillRule="evenodd" />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}
