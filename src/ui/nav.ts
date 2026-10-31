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

export const navState = <R>() => history.state as NavState<R> | null;

/** Closes a sheet/dialog on Back; closing it in the UI removes its history entry again. */
export function useBackClose(onClose: () => void): void {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    history.pushState({ ...(history.state ?? {}), sheet: true }, '');
    let popped = false;
    const onPop = () => {
      popped = true;
      ref.current();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      if (!popped && (history.state as NavState<unknown> | null)?.sheet) history.back();
    };
  }, []);
}
