import { isIOS } from './youtube';

/**
 * Hides the song from the phone's media notification and lock screen.
 *
 * The YouTube IFrame player is cross-origin and sets its own Media Session metadata (video title and
 * thumbnail), which gives the answer away. Chrome shows the notification of the top-most frame that
 * has playing media and uses the Media Session, so while a game is active the top document does too:
 * neutral metadata, inert action handlers and (not on iOS) a looping, truly silent <audio> element.
 * The audio must not be `muted` or have a low volume: Chrome ignores muted media for the session.
 */

const TITLE = 'Tiki';
const ARTIST = 'Đang đoán bài...';
const REFRESH_MS = 3000;
const ACTIONS: MediaSessionAction[] = ['play', 'pause', 'previoustrack', 'nexttrack', 'seekto', 'seekbackward', 'seekforward', 'stop'];

let active = false;
let timer: ReturnType<typeof setInterval> | undefined;
let audio: HTMLAudioElement | null = null;
let wavUrl = '';
let meta: MediaMetadata | null = null;

const session = (): MediaSession | null => (typeof navigator !== 'undefined' && 'mediaSession' in navigator ? navigator.mediaSession : null);

/** 8 s of 16-bit mono 8 kHz PCM, all zero samples. Longer than 5 s so Chrome shows a notification. */
function silentWavUrl(): string {
  if (wavUrl) return wavUrl;
  const rate = 8000, seconds = 8, bytes = rate * seconds * 2;
  const buf = new ArrayBuffer(44 + bytes);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + bytes, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, bytes, true);
  wavUrl = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  return wavUrl;
}

function artwork(): MediaImage[] {
  const base = import.meta.env.BASE_URL;
  return [
    { src: base + 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: base + 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
  ];
}

function applyMetadata(ms: MediaSession): void {
  // The iframe may have replaced ours; only write when it did (identity check keeps this cheap).
  if (meta && ms.metadata === meta) return;
  try {
    meta = new MediaMetadata({ title: TITLE, artist: ARTIST, album: '', artwork: artwork() });
    ms.metadata = meta;
  } catch {
    /* MediaMetadata unsupported or rejected */
  }
}

function ensureAudio(): void {
  if (isIOS()) return; // a second media element could interrupt the YouTube iframe on iOS
  if (!audio) {
    audio = new Audio();
    audio.loop = true;
    audio.preload = 'auto';
    audio.src = silentWavUrl();
    audio.setAttribute('aria-hidden', 'true');
  }
  if (audio.paused) void audio.play().catch(() => { /* needs a user gesture; the next refresh retries */ });
}

/** Re-asserts metadata, state and the silent audio. Cheap; call on every clip play. */
export function refreshMediaCover(): void {
  if (!active) return;
  const ms = session();
  if (ms) {
    applyMetadata(ms);
    try {
      ms.playbackState = 'playing';
    } catch { /* ignore */ }
  }
  ensureAudio();
}

/** Starts the neutral media notification for a game or match (call from a game screen mount). */
export function startMediaCover(): void {
  if (active) return refreshMediaCover();
  active = true;
  const ms = session();
  if (ms) {
    for (const a of ACTIONS) {
      try {
        ms.setActionHandler(a, () => { /* inert: lock-screen buttons must not control the hidden player */ });
      } catch { /* action not supported */ }
    }
  }
  refreshMediaCover();
  timer = setInterval(refreshMediaCover, REFRESH_MS);
}

/** Leaving the game or match: pause the silent audio, clear metadata and handlers. */
export function stopMediaCover(): void {
  if (!active) return;
  active = false;
  clearInterval(timer);
  timer = undefined;
  if (audio) {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    audio = null;
  }
  const ms = session();
  if (ms) {
    for (const a of ACTIONS) {
      try {
        ms.setActionHandler(a, null);
      } catch { /* ignore */ }
    }
    try {
      ms.metadata = null;
      ms.playbackState = 'none';
    } catch { /* ignore */ }
  }
  meta = null;
}
