/** Stickers ("emote") for rooms: drawn presets (SVG, no emoji) and custom 1:1 images kept on this device. */
import type { ComponentChildren } from 'preact';

const FONT = { fontFamily: "'Bricolage Grotesque', 'Be Vietnam Pro', sans-serif", fontWeight: 800 };

/** Spiky burst polygon around (60, 60). */
function burst(n: number, r1: number, r2: number): string {
  return Array.from({ length: n * 2 }, (_, i) => {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? r2 : r1;
    return `${(60 + Math.cos(a) * r).toFixed(1)},${(60 + Math.sin(a) * r).toFixed(1)}`;
  }).join(' ');
}

function Art({ children, tilt = 0 }: { children: ComponentChildren; tilt?: number }) {
  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%" aria-hidden="true">
      <g transform={`rotate(${tilt} 60 60)`}>{children}</g>
    </svg>
  );
}

export interface PresetSticker {
  id: string;
  label: string;
  art: () => ComponentChildren;
}

export const PRESET_STICKERS: PresetSticker[] = [
  {
    id: 'gay', label: 'Gáy', art: () => (
      <Art tilt={-6}>
        <path d="M30 40l12 12 18-22 18 22 12-12-6 30H36z" fill="#ffc83d" stroke="#14173a" stroke-width="5" stroke-linejoin="round" />
        <rect x="14" y="68" width="92" height="38" rx="12" fill="#14173a" />
        <text x="60" y="97" text-anchor="middle" font-size="30" fill="#ffc83d" style={FONT}>GÁY!</text>
      </Art>
    ),
  },
  {
    id: 'ohf', label: 'Oh f*ck', art: () => (
      <Art tilt={5}>
        <polygon points={burst(12, 58, 40)} fill="#ff4d5e" stroke="#14173a" stroke-width="5" stroke-linejoin="round" />
        <text x="60" y="56" text-anchor="middle" font-size="24" fill="#fff" style={FONT}>OH</text>
        <text x="60" y="82" text-anchor="middle" font-size="22" fill="#fff" style={FONT}>F*CK</text>
      </Art>
    ),
  },
  {
    id: 'cay', label: 'Cay', art: () => (
      <Art tilt={-4}>
        <path d="M34 28c8-8 18-6 22 0" fill="none" stroke="#2f9e58" stroke-width="7" stroke-linecap="round" />
        <path d="M40 30c26-6 52 10 50 40-1 22-20 40-56 44 22-14 30-30 22-50-4-10-12-18-16-34z" fill="#ff3b30" stroke="#14173a" stroke-width="5" stroke-linejoin="round" />
        <path d="M58 44c10 2 18 10 18 22" fill="none" stroke="#ff9a8f" stroke-width="5" stroke-linecap="round" />
        <rect x="6" y="80" width="62" height="32" rx="10" fill="#14173a" />
        <text x="37" y="104" text-anchor="middle" font-size="24" fill="#ff8a3d" style={FONT}>CAY</text>
      </Art>
    ),
  },
  {
    id: 'tuc', label: 'Tức', art: () => (
      <Art tilt={4}>
        <circle cx="60" cy="54" r="40" fill="#9b6dff" stroke="#14173a" stroke-width="5" />
        <path d="M36 42l16 8M84 42l-16 8" stroke="#14173a" stroke-width="6" stroke-linecap="round" />
        <circle cx="46" cy="58" r="5" fill="#14173a" /><circle cx="74" cy="58" r="5" fill="#14173a" />
        <path d="M46 78q14-10 28 0" fill="none" stroke="#14173a" stroke-width="6" stroke-linecap="round" />
        <path d="M94 16l6-6M102 28l9-2M86 10l2-8" stroke="#ff4d5e" stroke-width="5" stroke-linecap="round" />
        <rect x="32" y="90" width="56" height="28" rx="10" fill="#14173a" />
        <text x="60" y="111" text-anchor="middle" font-size="21" fill="#fff" style={FONT}>TỨC</text>
      </Art>
    ),
  },
  {
    id: 'hello', label: 'Hello', art: () => (
      <Art tilt={-5}>
        <rect x="10" y="34" width="100" height="52" rx="18" fill="#38d39f" stroke="#14173a" stroke-width="5" />
        <text x="60" y="70" text-anchor="middle" font-size="27" fill="#14173a" style={FONT}>HELLO</text>
        <path d="M92 22a14 14 0 0 1 14 12M96 12a26 26 0 0 1 20 20" fill="none" stroke="#38d39f" stroke-width="5" stroke-linecap="round" />
      </Art>
    ),
  },
  {
    id: 'haha', label: 'Haha', art: () => (
      <Art tilt={7}>
        <polygon points={burst(9, 54, 44)} fill="#3fa9ff" stroke="#14173a" stroke-width="5" stroke-linejoin="round" />
        <text x="60" y="70" text-anchor="middle" font-size="28" fill="#fff" style={FONT}>HAHA</text>
      </Art>
    ),
  },
  {
    id: 'gg', label: 'GG', art: () => (
      <Art tilt={-3}>
        <rect x="18" y="22" width="84" height="76" rx="22" fill="#14173a" stroke="#38d39f" stroke-width="5" />
        <text x="60" y="78" text-anchor="middle" font-size="46" fill="#38d39f" style={FONT}>GG</text>
      </Art>
    ),
  },
  {
    id: 'de', label: 'Dễ ợt', art: () => (
      <Art tilt={6}>
        <rect x="8" y="36" width="104" height="48" rx="24" fill="#fff" stroke="#14173a" stroke-width="5" />
        <text x="60" y="70" text-anchor="middle" font-size="25" fill="#6c5cff" style={FONT}>DỄ ỢT</text>
      </Art>
    ),
  },
];

export const presetSticker = (id: string) => PRESET_STICKERS.find((s) => s.id === id);

// Custom stickers: cropped 160 px squares, kept in localStorage on this device.
export interface CustomSticker {
  id: string;
  data: string;
}
const KEY = 'tiki.stickers';
export const MAX_CUSTOM = 12;

export function customStickers(): CustomSticker[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x?.id === 'string' && typeof x?.data === 'string') : [];
  } catch {
    return [];
  }
}

export function saveCustomStickers(list: CustomSticker[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_CUSTOM)));
    return true;
  } catch {
    return false;
  }
}

export const newStickerId = () => Math.random().toString(36).slice(2, 10);
