import type { RefObject } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { getSettings, subscribeSettings } from '../data/settings';
import { youtubeEngine } from '../audio/youtube';

/** Subscribes to a tiny external store. */
export function useStore<T>(subscribe: (fn: () => void) => () => unknown, get: () => T): T {
  const [v, setV] = useState(get);
  useEffect(() => {
    setV(get);
    const un = subscribe(() => setV(get));
    return () => void un();
  }, []);
  return v;
}

export const useSettings = () => useStore(subscribeSettings, getSettings);

/** Visible viewport box (shrinks when the on-screen keyboard opens). */
export function useVisualViewport(): { top: number; height: number } {
  const read = () => {
    const vv = window.visualViewport;
    return vv ? { top: vv.offsetTop, height: vv.height } : { top: 0, height: window.innerHeight };
  };
  const [box, setBox] = useState(read);
  useEffect(() => {
    const vv = window.visualViewport;
    const on = () => setBox(read());
    vv?.addEventListener('resize', on);
    vv?.addEventListener('scroll', on);
    window.addEventListener('resize', on);
    return () => {
      vv?.removeEventListener('resize', on);
      vv?.removeEventListener('scroll', on);
      window.removeEventListener('resize', on);
    };
  }, []);
  return box;
}

/**
 * While active, keeps the active YouTube player positioned over the given slot element. The box is
 * measured once, then again on resize/scroll events and for a burst of ~0.9 s after mount (layout
 * animations); styles are only written when the box changed. The iframe is never moved in the DOM.
 */
export function usePlayerSlot(ref: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const yt = youtubeEngine();
    yt.setMode('reveal');
    let raf = 0;
    let last = '';
    const apply = () => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      const key = `${r.left}|${r.top}|${r.width}|${r.height}`;
      if (key === last) return;
      last = key;
      Object.assign(yt.host.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    };
    const until = performance.now() + 900;
    const burst = () => {
      apply();
      if (performance.now() < until) raf = requestAnimationFrame(burst);
    };
    burst();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(apply) : null;
    if (ref.current) ro?.observe(ref.current);
    ro?.observe(document.body); // content shifting above the slot
    const vv = window.visualViewport;
    const opt = { capture: true, passive: true } as const;
    window.addEventListener('resize', apply);
    window.addEventListener('scroll', apply, opt);
    vv?.addEventListener('resize', apply);
    vv?.addEventListener('scroll', apply);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('resize', apply);
      window.removeEventListener('scroll', apply, opt);
      vv?.removeEventListener('resize', apply);
      vv?.removeEventListener('scroll', apply);
      yt.setMode('hidden');
    };
  }, [active]);
}
