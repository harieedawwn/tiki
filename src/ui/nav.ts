/**
 * In-app history: every screen is a browser history entry, so the browser/phone Back button steps
 * back one screen (and closes open sheets) and only leaves the app from the home screen.
 */
import { useEffect, useRef } from 'preact/hooks';

export interface NavState<R> {
  route: R;
  depth: number;
  sheet?: boolean;
}

// Open sheets share one history entry. It is added when the first opens and removed when the last
// closes, debounced so one sheet replacing another (tray -> crop) keeps it.
const open: { close: () => void }[] = [];
let hasEntry = false;
let traversing = false;
let timer = 0;

function sync(): void {
  clearTimeout(timer);
  timer = window.setTimeout(() => {
    if (traversing) return;
    if (open.length && !hasEntry) {
      history.pushState({ ...(history.state ?? {}), sheet: true }, '');
      hasEntry = true;
    } else if (!open.length && hasEntry) {
      hasEntry = false;
      traversing = true;
      history.back();
    }
  }, 150);
}

window.addEventListener('popstate', () => {
  if (traversing) {
    traversing = false;
    sync();
    return;
  }
  if (!hasEntry) return;
  // Back pressed with a sheet open: close the top one.
  hasEntry = false;
  open[open.length - 1]?.close();
  sync();
});

/** Closes a sheet/dialog on Back; closing it in the UI removes its history entry again. */
export function useBackClose(onClose: () => void): void {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    const entry = { close: () => ref.current() };
    open.push(entry);
    sync();
    return () => {
      const i = open.indexOf(entry);
      if (i >= 0) open.splice(i, 1);
      sync();
    };
  }, []);
}
