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

/** While active, keeps the single YouTube player positioned over the given slot element. */
export function usePlayerSlot(ref: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const yt = youtubeEngine();
    yt.setMode('reveal');
    let raf = 0;
    const tick = () => {
      const r = ref.current?.getBoundingClientRect();
      if (r) Object.assign(yt.host.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      yt.setMode('hidden');
    };
  }, [active]);
}
