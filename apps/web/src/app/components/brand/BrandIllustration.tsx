import { useId } from 'react';
import { Bell, CalendarDays, Check, Cog, FileText, Inbox, PhoneCall, Search, TriangleAlert } from 'lucide-react';
import { gearOutline } from './gear';
import { cn } from '../ui/utils';

export type BrandIllustrationScene =
  | 'empty'
  | 'search'
  | 'notifications'
  | 'error'
  | 'documents'
  | 'machines'
  | 'calls'
  | 'calendar'
  | 'success';

type Props = {
  scene: BrandIllustrationScene;
  size?: 'sm' | 'md';
  className?: string;
};

const SCENE_GLYPH: Record<BrandIllustrationScene, typeof Inbox> = {
  empty: Inbox,
  search: Search,
  notifications: Bell,
  error: TriangleAlert,
  documents: FileText,
  machines: Cog,
  calls: PhoneCall,
  calendar: CalendarDays,
  success: Check,
};

const G12 = gearOutline(12, 48, 39, 20);
const G9 = gearOutline(9, 48, 37, 18);
const G8 = gearOutline(8, 48, 36, 16);

/**
 * Logo temelli, derinlikli boş-durum illüstrasyonu: gradyanlı dişli kümesi +
 * sahneye özel rozet. Tüm renkler token'lardan gelir; koyu temada uyumludur.
 */
export function BrandIllustration({ scene, size = 'md', className }: Props) {
  const uid = useId();
  const Glyph = SCENE_GLYPH[scene];
  const isError = scene === 'error';
  const isSuccess = scene === 'success';

  return (
    <div
      className={cn(
        'relative grid place-items-center',
        size === 'md' ? 'h-32 w-44' : 'h-24 w-32',
        className,
      )}
      aria-hidden="true"
    >
      <svg viewBox="0 0 220 160" className="h-full w-full">
        <defs>
          <linearGradient id={`${uid}-deep`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--operation-blue)" />
            <stop offset="1" stopColor="var(--brand-blue)" />
          </linearGradient>
          <radialGradient id={`${uid}-halo`}>
            <stop offset="0" stopColor="var(--brand-blue-soft)" />
            <stop offset="0.75" stopColor="var(--brand-blue-soft)" stopOpacity="0.55" />
            <stop offset="1" stopColor="var(--brand-blue-soft)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx="110" cy="82" rx="100" ry="72" fill={`url(#${uid}-halo)`} />
        <circle cx="110" cy="80" r="58" fill="none" stroke="var(--brand-blue)" strokeOpacity="0.18" strokeWidth="1.5" strokeDasharray="3 7" />
        {/* Ana dişli — gradyanla derinlik */}
        <g transform="translate(110 80) scale(1.02) rotate(12)">
          <path d={G12} fill={`url(#${uid}-deep)`} fillRule="evenodd" />
        </g>
        {/* Arka yardımcı dişli */}
        <g transform="translate(178 38) scale(0.42) rotate(-8)" opacity="0.9">
          <path d={G9} fill="var(--brand-blue)" fillOpacity="0.22" fillRule="evenodd" />
        </g>
        {/* Kırmızı aksan dişlisi */}
        <g transform="translate(42 122) scale(0.3) rotate(18)">
          <path d={G8} fill="var(--brand-red)" fillOpacity="0.85" fillRule="evenodd" />
        </g>
        {/* Parlama */}
        <ellipse cx="86" cy="52" rx="26" ry="12" fill="#ffffff" opacity="0.14" transform="rotate(-24 86 52)" />
      </svg>
      <span
        className={cn(
          'absolute grid place-items-center rounded-full border bg-card shadow-md',
          size === 'md' ? 'size-12' : 'size-9',
          isError
            ? 'border-destructive/25 text-destructive'
            : isSuccess
              ? 'border-success/25 text-success'
              : 'border-primary/15 text-primary',
        )}
      >
        <Glyph className={size === 'md' ? 'size-5' : 'size-4'} strokeWidth={1.8} />
      </span>
    </div>
  );
}
