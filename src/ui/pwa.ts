import { isIOS } from '../audio/youtube';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((f) => f());

export function initInstallCapture(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    changed();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    changed();
  });
}

export const subscribeInstall = (fn: () => void) => (listeners.add(fn), () => listeners.delete(fn));

export const isStandalone = () =>
  matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export type InstallKind = 'prompt' | 'ios' | null;
export const installKind = (): InstallKind => (isStandalone() ? null : deferred ? 'prompt' : isIOS() ? 'ios' : null);

export async function promptInstall(): Promise<void> {
  if (!deferred) return;
  await deferred.prompt();
  await deferred.userChoice.catch(() => null);
  deferred = null;
  changed();
}

let fullscreenTried = false;
/** Called on the first "Chơi" tap: fullscreen + portrait lock where supported. */
export function enterFullscreenOnce(): void {
  if (fullscreenTried || isStandalone()) return;
  fullscreenTried = true;
  const el = document.documentElement;
  if (!document.fullscreenElement && el.requestFullscreen) {
    el.requestFullscreen({ navigationUI: 'hide' })
      .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('portrait'))
      .catch(() => {});
  }
}
