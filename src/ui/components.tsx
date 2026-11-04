import type { CSSProperties, ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { MAX_STAGES, MIN_STAGES, formatSeconds, validStages } from '../core/stages';
import type { Song } from '../core/types';
import { IconMusic } from './icons';
import { useBackClose } from './nav';

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// YouTube thumbnails: maxres is 100-200 KB; hqdefault as WebP (~10-15 KB) is plenty for tiles. It is
// letterboxed (4:3 around a 16:9 frame), so tiles zoom it to hide the bars.
const YT_THUMB = /^https:\/\/i\d?\.ytimg\.com\/vi(?:_webp)?\/([^/]+)\/[a-z0-9_]+\.(?:jpg|webp)/i;
export function coverUrl(url: string, q: 'sm' | 'lg'): { src: string; fallback?: string; lb: boolean } {
  const m = url.match(YT_THUMB);
  if (!m) return { src: url, lb: false };
  if (q === 'lg') return { src: url, lb: false };
  return { src: `https://i.ytimg.com/vi_webp/${m[1]}/hqdefault.webp`, fallback: `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg`, lb: true };
}

/** Warms the browser cache for covers likely to be shown soon (small thumbnails, a few at a time). */
export function prefetchCovers(urls: string[]): void {
  const list = urls.filter(Boolean).map((u) => coverUrl(u, 'sm').src);
  let i = 0;
  const next = () => {
    if (i >= list.length) return;
    const img = new Image();
    img.decoding = 'async';
    img.onload = img.onerror = next;
    img.src = list[i++];
  };
  for (let k = 0; k < 6; k++) next();
}

/**
 * Square cover. `q="lg"` shows the small thumbnail first and swaps in the full one when it arrives.
 * Without an image: a flat block with the title's first letter (or a note when `anonymous`).
 */
export function Cover({ song, size, q = 'sm', anonymous, eager }: {
  song: Pick<Song, 'cover' | 'title'>; size?: number; q?: 'sm' | 'lg'; anonymous?: boolean; eager?: boolean;
}) {
  const style = size ? { width: size + 'px', height: size + 'px' } : undefined;
  const sm = useMemo(() => coverUrl(song.cover, 'sm'), [song.cover]);
  const lg = useMemo(() => (q === 'lg' ? coverUrl(song.cover, 'lg') : null), [song.cover, q]);
  // Track which src has loaded (not a flag), so a cached image that loads before effects run still shows.
  const [src, setSrc] = useState(sm.src);
  const [done, setDone] = useState('');
  const [big, setBig] = useState('');
  if (src !== sm.src && src !== sm.fallback) setSrc(sm.src);
  if (!song.cover) {
    return (
      <span class="cover cover-empty" style={style} aria-hidden="true">
        {anonymous ? <IconMusic size={28} /> : song.title.trim().charAt(0).toUpperCase() || '?'}
      </span>
    );
  }
  const check = (el: HTMLImageElement | null) => {
    if (el?.complete && el.naturalWidth > 0 && done !== el.getAttribute('src')) setDone(el.getAttribute('src')!);
  };
  return (
    <span class={'cover' + (done === src ? ' loaded' : '')} style={style}>
      <img ref={check} class={sm.lb ? 'lb' : ''} src={src} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async"
        referrerpolicy="no-referrer" {...{ fetchpriority: eager ? 'high' : 'auto' }}
        onLoad={() => setDone(src)}
        onError={() => (sm.fallback && src !== sm.fallback ? setSrc(sm.fallback) : setDone(src))} />
      {lg && lg.src !== sm.src && (
        <img class={'cover-hi' + (big === lg.src ? ' on' : '')} src={lg.src} alt="" decoding="async" referrerpolicy="no-referrer" onLoad={() => setBig(lg.src)} />
      )}
    </span>
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
    v = 0.55 * v + 0.45 * (((h >>> 0) % 1000) / 1000);
    const env = Math.min(1, (i + 2) / 8);
    out.push(0.14 + 0.86 * v * env);
  }
  return out;
}

export interface ClipRun {
  /** performance.now() at which the audio starts. */
  start: number;
  ms: number;
  /** Changes for every play, restarting the animation. */
  key: number;
}

/** True while a clip is sounding. */
export function useClipPlaying(clip: ClipRun | null | undefined): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!clip) return setOn(false);
    const now = performance.now();
    const t1 = setTimeout(() => setOn(true), Math.max(0, clip.start - now));
    const t2 = setTimeout(() => setOn(false), Math.max(0, clip.start + clip.ms - now));
    return () => (clearTimeout(t1), clearTimeout(t2));
  }, [clip?.key]);
  return on;
}

const N_BARS = 56;

/**
 * Signature element: the opening of the song as bars spanning the longest stage. The part unlocked so
 * far is tinted; while a clip plays, a playhead runs across it in real time and the heard bars move.
 */
export function ClipBar({ seed, stages, stage, clip }: { seed: string; stages: number[]; stage: number; clip?: ClipRun | null }) {
  const heights = useMemo(() => bars(seed, N_BARS), [seed]);
  const total = stages[stages.length - 1];
  const unlocked = Math.min(100, (stages[stage] / total) * 100);
  const reveal = useRef<HTMLDivElement>(null);
  const live = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const playing = useClipPlaying(clip);
  const svg = useMemo(() => (
    <svg viewBox={`0 0 ${N_BARS * 10} 100`} preserveAspectRatio="none" aria-hidden="true">
      {heights.map((h, i) => {
        const bh = h * 92;
        return <rect key={i} x={i * 10 + 2} y={(100 - bh) / 2} width={6} height={bh} rx={3} style={{ '--i': i } as CSSProperties} />;
      })}
    </svg>
  ), [heights]);

  useEffect(() => {
    if (!clip || !reveal.current || !live.current || !head.current) return;
    const to = Math.min(100, (clip.ms / 1000 / total) * 100);
    const delay = Math.max(0, clip.start - performance.now());
    const late = Math.max(0, performance.now() - clip.start);
    const opts: KeyframeAnimationOptions = { duration: clip.ms, delay, easing: 'linear', fill: 'both' };
    // Compositor-only reveal: the clipping wrapper slides right while its content slides left by the same amount.
    const a = reveal.current.animate([{ transform: 'translateX(-100%)' }, { transform: `translateX(${to - 100}%)` }], opts);
    const a2 = live.current.animate([{ transform: 'translateX(100%)' }, { transform: `translateX(${100 - to}%)` }], opts);
    const b = head.current.animate(
      [{ transform: 'translateX(0%)', opacity: 1 }, { transform: `translateX(${to}%)`, opacity: 1, offset: 0.999 }, { transform: `translateX(${to}%)`, opacity: 0 }],
      opts,
    );
    if (late) a.currentTime = a2.currentTime = b.currentTime = late;
    return () => (a.cancel(), a2.cancel(), b.cancel());
  }, [clip?.key, total]);

  return (
    <div class={'clipbar' + (playing ? ' playing' : '')} role="img" aria-label={`Đoạn ${formatSeconds(stages[stage])} trên ${formatSeconds(total)}`}>
      <div class="clipbar-track">
        <div class="clipbar-layer base">{svg}</div>
        <div class="clipbar-layer unlocked" style={{ clipPath: `inset(0 ${100 - unlocked}% 0 0)` }}>{svg}</div>
        <div class="clipbar-reveal" ref={reveal} aria-hidden="true"><div class="clipbar-layer live" ref={live}>{svg}</div></div>
        <div class="clipbar-head" ref={head}><i /></div>
        <div class="clipbar-marks">
          {stages.map((s, i) => <span key={i} class={'clipbar-mark' + (i <= stage ? ' on' : '')} style={{ left: (s / total) * 100 + '%' }} />)}
        </div>
      </div>
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
        <li key={i} class={i < stage || (i === stage && revealed) ? 'past' : i === stage ? 'current' : ''}>
          <span class="seg"><i /></span>
          <span class="lbl num">{formatSeconds(s)}</span>
        </li>
      ))}
    </ol>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: ComponentChildren; disabled?: boolean }[]; onChange: (v: T) => void; label: string;
}) {
  const i = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div class="segmented" role="radiogroup" aria-label={label} style={{ '--n': options.length, '--i': i } as CSSProperties}>
      <span class="segmented-thumb" aria-hidden="true" />
      {options.map((o) => (
        <button key={String(o.value)} role="radio" aria-checked={o.value === value} class={o.value === value ? 'on' : ''}
          disabled={o.disabled} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

const parseSec = (v: string) => (v.trim() === '' ? NaN : Number(v.replace(',', '.')));

/** Editor for the custom difficulty: 3-8 increasing stage lengths. Reports the parsed list, or null while invalid. */
export function StageEditor({ initial, onChange }: { initial: number[]; onChange: (stages: number[] | null) => void }) {
  const [vals, setVals] = useState(() => initial.map(String));
  const nums = vals.map(parseSec);
  const ok = validStages(nums);
  const apply = (next: string[]) => {
    setVals(next);
    const n = next.map(parseSec);
    onChange(validStages(n) ? n : null);
  };
  const setCount = (n: number) => {
    if (n < vals.length) return apply(vals.slice(0, n));
    const out = vals.slice();
    while (out.length < n) {
      const last = parseSec(out[out.length - 1]);
      out.push(String(Number.isFinite(last) ? Math.min(30, Math.round((last * 1.5 + 0.5) * 2) / 2) : 1));
    }
    apply(out);
  };
  const counts = Array.from({ length: MAX_STAGES - MIN_STAGES + 1 }, (_, i) => MIN_STAGES + i);
  return (
    <div class="stack-sm">
      <span class="field-label">Số đoạn</span>
      <Segmented label="Số đoạn" value={vals.length} onChange={setCount} options={counts.map((n) => ({ value: n, label: String(n) }))} />
      <span class="field-label">Độ dài mỗi đoạn (giây)</span>
      <div class="stage-grid">
        {vals.map((v, i) => (
          <input key={i} class={'input input-num num' + (v !== '' && !ok && !(nums[i] > 0 && nums[i] <= 30 && (i === 0 || nums[i] > nums[i - 1])) ? ' bad' : '')}
            inputMode="decimal" value={v} aria-label={`Đoạn ${i + 1}`}
            onInput={(e) => apply(vals.map((x, j) => (j === i ? e.currentTarget.value : x)))} />
        ))}
      </div>
      {!ok && <p class="error-text">Cần {MIN_STAGES} đến {MAX_STAGES} số tăng dần, từ 0 đến 30 giây (ví dụ 0,5).</p>}
    </div>
  );
}

/** Large selectable cards with an icon (game kinds, match formats). */
export function ChoiceCards<T extends string>({ value, options, onChange, label, cols = 2 }: {
  value: T; label: string; cols?: number;
  options: { value: T; title: string; desc?: string; icon: ComponentChildren; disabled?: boolean; note?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div class={'choice-cards cols-' + cols} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={o.value === value} disabled={o.disabled}
          class={'choice' + (o.value === value ? ' on' : '')} onClick={() => onChange(o.value)}>
          <span class="choice-icon">{o.icon}</span>
          <span class="choice-title">{o.title}</span>
          {(o.note || o.desc) && <span class="choice-desc">{o.note ?? o.desc}</span>}
        </button>
      ))}
    </div>
  );
}

/** Generic bottom sheet with a scrim. */
export function Sheet({ onClose, children, title }: { onClose: () => void; children: ComponentChildren; title: string }) {
  useBackClose(onClose);
  return (
    <div class="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="sheet sheet-auto" role="dialog" aria-label={title}>
        <span class="sheet-grip" aria-hidden="true" />
        <h2 class="sheet-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function ErrorBox({ children }: { children: ComponentChildren }) {
  return <div class="errorbox" role="alert">{children}</div>;
}

/** Number that counts up to its value (ease-out, ~0.6 s). */
export function CountUp({ value, ms = 650, prefix = '' }: { value: number; ms?: number; prefix?: string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const a = from.current, b = value;
    from.current = value;
    if (a === b || reduced()) return setShown(b);
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setShown(Math.round(a + (b - a) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{prefix}{shown.toLocaleString('vi-VN')}</>;
}

const BURST_COLORS = ['var(--accent)', 'var(--good)', 'var(--warn)', 'var(--ink)'];

/** A short burst of flat paper pieces from the element's center. */
export function Burst({ n = 18 }: { n?: number }) {
  const parts = useMemo(() => Array.from({ length: n }, (_, i) => {
    const ang = (i / n) * Math.PI * 2 + Math.random() * 0.4;
    const dist = 70 + Math.random() * 90;
    return {
      '--x': Math.cos(ang) * dist + 'px', '--y': Math.sin(ang) * dist - 30 + 'px', '--r': Math.round(Math.random() * 540 - 270) + 'deg',
      '--d': Math.round(Math.random() * 80) + 'ms', background: BURST_COLORS[i % BURST_COLORS.length],
      width: (i % 3 === 0 ? 10 : 7) + 'px', height: (i % 3 === 0 ? 4 : 7) + 'px',
    } as CSSProperties;
  }), []);
  if (reduced()) return null;
  return <span class="burst" aria-hidden="true">{parts.map((s, i) => <i key={i} style={s} />)}</span>;
}

/** Horizontal shake for wrong answers. */
export function shake(el: Element | null | undefined): void {
  if (!el || reduced()) return;
  el.animate(
    [{ transform: 'none' }, { transform: 'translateX(-9px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(3px)' }, { transform: 'none' }],
    { duration: 380, easing: 'ease-out' },
  );
}

/** Full-screen 3-2-1 before a shared clip, with a ring that empties each second. */
export function CountdownOverlay({ n, label }: { n: number; label: ComponentChildren }) {
  return (
    <div class="countdown" aria-live="assertive">
      <div class="countdown-dial">
        <svg viewBox="0 0 120 120" aria-hidden="true"><circle class="ring-bg" cx="60" cy="60" r="54" /><circle key={n} class="ring" cx="60" cy="60" r="54" /></svg>
        <span key={n} class="countdown-n num">{n}</span>
      </div>
      <small>{label}</small>
    </div>
  );
}
