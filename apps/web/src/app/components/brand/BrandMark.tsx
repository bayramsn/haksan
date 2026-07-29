import { useId } from 'react';
import { gearOutline } from './gear';

type Props = {
  variant?: 'emblem' | 'full' | 'wordmark';
  tone?: 'color' | 'mono' | 'reverse';
  className?: string;
};

const GEAR = gearOutline(14, 48, 40, 31);

/**
 * Haksan dişli + H amblemi — PNG logonun geometrik SVG yeniden inşası.
 * Renkler CSS değişkenlerinden gelir; koyu temada kendiliğinden uyum sağlar.
 */
export function BrandMark({ variant = 'emblem', tone = 'color', className }: Props) {
  const uid = useId();
  const gear = tone === 'color' ? `url(#${uid}-g)` : 'currentColor';
  const accent = tone === 'color' ? 'var(--brand-red)' : 'currentColor';
  const ink = tone === 'reverse' ? '#ffffff' : tone === 'mono' ? 'currentColor' : undefined;

  const emblem = (
    <g>
      {tone === 'color' && (
        <defs>
          <linearGradient id={`${uid}-g`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--operation-blue)" />
            <stop offset="1" stopColor="var(--brand-blue)" />
          </linearGradient>
        </defs>
      )}
      <path d={GEAR} fill={ink ?? gear} fillRule="evenodd" />
      <circle r="27" fill="none" stroke={ink ?? gear} strokeWidth="3.5" />
      {/* H monogramı */}
      <path
        d="M-11 -14 h7 v10 h8 v-10 h7 v28 h-7 v-11 h-8 v11 h-7 Z"
        fill={ink ?? 'var(--brand-blue)'}
      />
      <circle cx="15" cy="-15" r="4" fill={accent} />
    </g>
  );

  if (variant === 'emblem') {
    return (
      <svg viewBox="-52 -52 104 104" className={className} aria-hidden="true">
        {emblem}
      </svg>
    );
  }

  const wordmark = (
    <g fontFamily="'Barlow Condensed', 'Arial Narrow', sans-serif" textAnchor="start">
      <text x="0" y="4" fontSize="46" fontWeight="700" letterSpacing="1" fill={ink ?? accent}>
        HAKSAN
      </text>
      <rect x="1" y="14" width="128" height="22" rx="3" fill={ink ?? 'var(--brand-blue)'} opacity={tone === 'color' ? 1 : 0.85} />
      <text
        x="65"
        y="30.5"
        fontSize="17"
        fontWeight="600"
        letterSpacing="7"
        textAnchor="middle"
        fill={tone === 'color' ? '#ffffff' : 'var(--background)'}
      >
        MAKİNA
      </text>
    </g>
  );

  if (variant === 'wordmark') {
    return (
      <svg viewBox="-4 -36 140 76" className={className} aria-label="Haksan Makina">
        {wordmark}
      </svg>
    );
  }

  return (
    <svg viewBox="-56 -52 254 104" className={className} aria-label="Haksan Makina">
      {emblem}
      <g transform="translate(62 -14)">{wordmark}</g>
    </svg>
  );
}
