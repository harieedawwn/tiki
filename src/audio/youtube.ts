import type { Playlist, Song } from '../core/types';
import { debug } from './debug';
import { SkipSongError, type AudioEngine, type ClipResult, type PrepareResult } from './engine';

// YT.PlayerState values (IFrame API reference): -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued.
const PLAYING = 1, PAUSED = 2, BUFFERING = 3;

export type PlayerMode = 'hidden' | 'reveal' | 'unlock';

export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let apiPromise: Promise<void> | null = null;
function loadApi(): Promise<void> {
  apiPromise ??= new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve();
    const w = window as unknown as { onYouTubeIframeAPIReady?: () => void };
    w.onYouTubeIframeAPIReady = () => resolve();
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => {
      apiPromise = null;
      reject(new Error('Không tải được YouTube. Kiểm tra mạng.'));
    };
    document.head.appendChild(s);
  });
  return apiPromise;
}

class YouTubeEngine implements AudioEngine {
  readonly kind = 'youtube' as const;
  readonly host: HTMLDivElement;
  private player: YT.Player | null = null;
  private ready: Promise<YT.Player> | null = null;
  private state = -1;
  private lastError = 0;
  private listeners = new Set<() => void>();
  private videoId = '';
  private startSec = 0;
  private token = 0;
  private unlocked = false;
  autoplayBlocked = false;

  constructor() {
    this.host = document.createElement('div');
    this.host.className = 'yt-host';
    this.host.setAttribute('aria-hidden', 'true');
    const inner = document.createElement('div');
    this.host.appendChild(inner);
    document.body.appendChild(this.host);
  }

  setMode(mode: PlayerMode): void {
    this.host.className = 'yt-host yt-' + mode;
    this.host.setAttribute('aria-hidden', mode === 'hidden' ? 'true' : 'false');
    if (mode !== 'reveal') this.host.removeAttribute('style');
  }

  private init(): Promise<YT.Player> {
    this.ready ??= loadApi().then(
      () =>
        new Promise<YT.Player>((resolve) => {
          const p = new YT.Player(this.host.firstElementChild as HTMLElement, {
            width: 200,
            height: 200,
            playerVars: { playsinline: 1, controls: 1, disablekb: 1, rel: 0, fs: 0, iv_load_policy: 3, origin: location.origin },
            events: {
              onReady: () => resolve(p),
              onStateChange: (e) => this.emit(e.data),
              onError: (e) => {
                this.lastError = e.data;
                debug({ note: 'YT error ' + e.data });
                this.emit(this.state);
              },
              onAutoplayBlocked: () => {
                this.autoplayBlocked = true;
                debug({ note: 'autoplay blocked' });
              },
            },
          });
          this.player = p;
        }),
    );
    return this.ready;
  }

  private emit(state: number): void {
    this.state = state;
    debug({ state: String(state) });
    this.listeners.forEach((f) => f());
  }

  /** Resolves when `pred` holds (checked on every state change and every 50 ms). */
  private waitFor(pred: () => boolean, timeoutMs: number, tok: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const check = () => {
        if (tok !== this.token) return done(new Error('cancelled'));
        if (this.lastError) return done(new SkipSongError('YouTube error ' + this.lastError));
        if (pred()) done();
      };
      const iv = setInterval(check, 50);
      const to = setTimeout(() => done(new SkipSongError('timeout')), timeoutMs);
      const done = (err?: Error) => {
        clearInterval(iv);
        clearTimeout(to);
        this.listeners.delete(check);
        err ? reject(err) : resolve();
      };
      this.listeners.add(check);
      check();
    });
  }

  needsTapUnlock(): boolean {
    return isIOS() && !this.unlocked;
  }

  /** iOS: shows the player and waits until the user taps play once; afterwards scripted playback works. */
  async unlockWithTap(videoId: string): Promise<void> {
    const p = await this.init();
    const tok = ++this.token;
    this.lastError = 0;
    this.setMode('unlock');
    p.cueVideoById({ videoId, startSeconds: 0 });
    await this.waitFor(() => this.state === PLAYING, 120000, tok);
    p.mute();
    p.pauseVideo();
    this.unlocked = true;
    this.setMode('hidden');
  }

  async prepare(song: Song, playlist: Pick<Playlist, 'defaultOffsetMs'>): Promise<PrepareResult> {
    if (song.source.type !== 'youtube') throw new SkipSongError('not youtube');
    const p = await this.init();
    const tok = ++this.token;
    const videoId = song.source.videoId;
    const startMs = song.startOffsetMs ?? playlist.defaultOffsetMs;
    this.videoId = videoId;
    this.startSec = startMs / 1000;
    this.lastError = 0;
    debug({ engine: 'youtube', startMs, state: 'preparing' });
    p.mute();
    // Forget the previous video's state: a stale PAUSED/PLAYING must not satisfy the waits below.
    this.state = -1;
    // Load and play muted in one step; pre-roll ads play out here until the real video passes the start point.
    p.loadVideoById({ videoId, startSeconds: this.startSec });
    // playVideo right after a load is sometimes ignored, leaving the player cued; nudge it until it moves.
    const kick = setInterval(() => {
      if (tok === this.token && this.state !== PLAYING && this.state !== BUFFERING) p.playVideo();
    }, 1500);
    try {
      await this.waitFor(() => {
        const data = (p as unknown as { getVideoData?: () => { video_id?: string } }).getVideoData?.();
        return this.state === PLAYING && data?.video_id === videoId && p.getCurrentTime() > this.startSec + 0.05;
      }, 30000, tok);
    } finally {
      clearInterval(kick);
    }
    p.pauseVideo();
    p.seekTo(this.startSec, true);
    await this.waitFor(() => this.state === PAUSED, 3000, tok).catch(() => {});
    debug({ state: 'ready' });
    return { startMs };
  }

  async playClip(durationMs: number, at?: number): Promise<ClipResult> {
    const p = await this.init();
    const tok = ++this.token;
    this.lastError = 0;
    p.pauseVideo();
    // The player is normally parked at the start already; seeking anyway forces a rebuffer and delays the clip.
    if (Math.abs(p.getCurrentTime() - this.startSec) > 0.15) p.seekTo(this.startSec, true);
    p.unMute();
    p.setVolume(100);
    if (at) await sleep(Math.max(0, at - performance.now()));
    if (tok !== this.token) return { requestedMs: durationMs, measuredMs: 0 };
    this.state = -1;
    p.playVideo();
    try {
      await this.waitFor(() => this.state === PLAYING, 6000, tok);
    } catch {
      p.mute();
      return { requestedMs: durationMs, measuredMs: 0 };
    }
    const t0 = performance.now();
    await sleep(durationMs);
    p.mute();
    p.pauseVideo();
    const measuredMs = Math.round((performance.now() - t0) * 10) / 10;
    if (tok === this.token) p.seekTo(this.startSec, true);
    debug({ requestedMs: durationMs, measuredMs });
    return { requestedMs: durationMs, measuredMs };
  }

  stop(): void {
    this.token++;
    if (!this.player) return;
    this.player.mute();
    this.player.pauseVideo();
  }

  get currentVideoId(): string {
    return this.videoId;
  }
}

let instance: YouTubeEngine | null = null;
/** The single YouTube player in the DOM. */
export function youtubeEngine(): YouTubeEngine {
  instance ??= new YouTubeEngine();
  return instance;
}
