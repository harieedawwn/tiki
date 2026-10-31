import type { ComponentChildren } from 'preact';
import { useMemo } from 'preact/hooks';
import { formatSeconds } from '../core/stages';
import type { Song } from '../core/types';

/** Square cover; falls back to a flat block with the title's first letter. */
export function Cover({ song, size }: { song: Pick<Song, 'cover' | 'title'>; size?: number }) {
  const style = size ? { width: size + 'px', height: size + 'px' } : undefined;
  return song.cover ? (
    <img class="cover" src={song.cover} alt="" loading="lazy" decoding="async" style={style} referrerpolicy="no-referrer" />
  ) : (
    <div class="cover cover-empty" style={style} aria-hidden="true">{song.title.trim().charAt(0).toUpperCase() || '?'}</div>
  );
}

/** Deterministic pseudo-waveform heights from a seed string. */
function bars(seed: string, n: number): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const out: number[] = [];
  let v = 0.5;
  for (let i = 0; i < n; i++) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909);
    v = 0.6 * v + 0.4 * (((h >>> 0) % 1000) / 1000);
    const env = Math.min(1, (i + 3) / 10);
    out.push(0.12 + 0.88 * v * env);
  }
  return out;
}

/**
 * Signature element: the opening of the song as a strip of bars, with the clip heard so far
 * shown as a vermilion sliver ending at the playhead. The strip spans the last stage's length.
 */
export function ClipBar({ seed, stages, stage, pulse }: { seed: string; stages: number[]; stage: number; pulse: number }) {
  const N = 96;
  const heights = useMemo(() => bars(seed, N), [seed]);
  const total = stages[stages.length - 1];
  const frac = Math.min(1, stages[stage] / total);
  const W = 960, H = 200, bw = W / N;
  const x = Math.max(3, frac * W);
  return (
    <div class="clipbar">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Đoạn ${formatSeconds(stages[stage])} trên ${formatSeconds(total)}`}>
        {heights.map((h, i) => {
          const bh = h * (H - 24);
          return <rect key={i} x={i * bw + bw * 0.2} y={(H - bh) / 2} width={bw * 0.6} height={bh} class={i * bw < x ? 'bar heard' : 'bar'} />;
        })}
        <rect x={0} y={H / 2 - 1} width={x} height={2} class="heard" />
        <rect key={pulse} x={x - 3} y={0} width={6} height={H} class="playhead" />
      </svg>
      <div class="clipbar-scale num">
        <span>0</span>
        <span>{formatSeconds(total)}</span>
      </div>
    </div>
  );
}

export function StageIndicator({ stages, stage, revealed }: { stages: number[]; stage: number; revealed?: boolean }) {
  return (
    <ol class="stages" aria-label="Các đoạn">
      {stages.map((s, i) => (
        <li key={i} class={i < stage ? 'past' : i === stage && !revealed ? 'current' : i === stage ? 'past' : ''}>
          <span class="seg" />
          <span class="lbl num">{formatSeconds(s)}</span>
        </li>
      ))}
    </ol>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div class="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} role="radio" aria-checked={o.value === value} class={o.value === value ? 'on' : ''}
          onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

/** Generic bottom sheet with a scrim. */
export function Sheet({ onClose, children, title }: { onClose: () => void; children: ComponentChildren; title: string }) {
  return (
    <div class="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="sheet sheet-auto" role="dialog" aria-label={title}>
        <h2 class="sheet-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function ErrorBox({ children }: { children: ComponentChildren }) {
  return <div class="errorbox" role="alert">{children}</div>;
}
