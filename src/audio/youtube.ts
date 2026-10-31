import { startFromFrac } from '../core/modes';
import type { Playlist, Song } from '../core/types';
import { debug } from './debug';
import { SkipSongError, type AudioEngine, type ClipResult, type OnClipStart, type PrepareOptions, type PrepareResult } from './engine';

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

type VideoData = { video_id?: string };

/**
 * One IFrame player. It lives at body level for its whole life (moving an iframe reloads it) and is
 * only repositioned with CSS.
 */
class Slot {
  readonly host: HTMLDivElement;
  private player: YT.Player | null = null;
  private ready: Promise<YT.Player> | null = null;
  private state = -1;
  private lastError = 0;
  private listeners = new Set<() => void>();
  private startSec = 0;
  private token = 0;
  /** Smoothed delay between playVideo() and PLAYING, used to start scheduled clips on time. */
  private latency = 120;
  /** What this slot holds (or is loading): key and the prepare promise. */
  load: { key: string; done: Promise<PrepareResult> } | null = null;
  /** A load is in flight (muted); switching away must not cancel it. */
  loading = false;
  /** Last time this slot was asked for (least recently used is reused first). */
  used = 0;

  constructor(private onAutoplayBlocked: () => void) {
    this.host = document.createElement('div');
    this.host.className = 'yt-host';
    this.host.setAttribute('aria-hidden', 'true');
    this.host.appendChild(document.createElement('div'));
    document.body.appendChild(this.host);
  }

  setMode(mode: PlayerMode): void {
    this.host.className = 'yt-host yt-' + mode;
    this.host.setAttribute('aria-hidden', mode === 'hidden' ? 'true' : 'false');
    if (mode !== 'reveal') this.host.removeAttribute('style');
  }

  init(): Promise<YT.Player> {
    this.ready ??= loadApi().then(
      () =>
        new Promise<YT.Player>((resolve) => {
          const p = new YT.Player(this.host.firstElementChild as HTMLElement, {
            width: 200,
            height: 200,
            // Privacy-enhanced embeds (no cookies) get far fewer ads.
            host: 'https://www.youtube-nocookie.com',
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
                this.onAutoplayBlocked();
                debug({ note: 'autoplay blocked' });
              },
            },
          } as YT.PlayerOptions);
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

  /** iOS: shows the player and waits until the user taps play once; afterwards scripted playback works. */
  async unlockWithTap(videoId: string): Promise<void> {
    const p = await this.init();
    const tok = ++this.token;
    this.lastError = 0;
    this.load = null;
    this.setMode('unlock');
    this.state = -1;
    p.cueVideoById({ videoId, startSeconds: 0 });
    await this.waitFor(() => this.state === PLAYING, 120000, tok);
    p.mute();
    p.pauseVideo();
    this.setMode('hidden');
  }

  start(key: string, videoId: string, startMs: number, opts: PrepareOptions): Promise<PrepareResult> {
    const done = this.loadVideo(videoId, startMs, opts);
    this.load = { key, done };
    this.used = performance.now();
    this.loading = true;
    done.finally(() => {
      if (this.load?.done === done) this.loading = false;
    }).catch(() => {});
    done.catch(() => {
      if (this.load?.done === done) this.load = null;
    });
    return done;
  }

  private async loadVideo(videoId: string, startMs: number, opts: PrepareOptions): Promise<PrepareResult> {
    const p = await this.init();
    const tok = ++this.token;
    const frac = opts.startFrac ?? null;
    const clipSec = opts.clipSec ?? 12;
    this.lastError = 0;
    this.startSec = frac === null ? startMs / 1000 : 0;
    debug({ engine: 'youtube', startMs, state: 'preparing' });
    p.mute();
    // Forget the previous video's state: a stale PAUSED/PLAYING must not satisfy the waits below.
    this.state = -1;
    // Load and play muted in one step; pre-roll ads play out here, unheard, until the real video runs.
    p.loadVideoById({ videoId, startSeconds: this.startSec });
    // playVideo right after a load is sometimes ignored, leaving the player cued; nudge it until it moves.
    const kick = setInterval(() => {
      if (tok === this.token && this.state !== PLAYING && this.state !== BUFFERING) p.playVideo();
    }, 1500);
    const isCurrent = () => (p as unknown as { getVideoData?: () => VideoData }).getVideoData?.()?.video_id === videoId;
    let seekedFor = 0;
    try {
      await this.waitFor(() => {
        if (this.state !== PLAYING || !isCurrent()) return false;
        if (frac !== null) {
          // Random start: needs the duration. Re-seek if it changes (an ad reports its own length).
          const d = p.getDuration();
          if (!(d > 0)) return false;
          if (Math.abs(d - seekedFor) > 1) {
            seekedFor = d;
            this.startSec = startFromFrac(frac, d, clipSec);
            p.seekTo(this.startSec, true);
            return false;
          }
          const t = p.getCurrentTime();
          return t > this.startSec + 0.05 && t < this.startSec + 8;
        }
        return p.getCurrentTime() > this.startSec + 0.05;
      }, 30000, tok);
    } finally {
      clearInterval(kick);
    }
    p.pauseVideo();
    p.seekTo(this.startSec, true);
    await this.waitFor(() => this.state === PAUSED, 3000, tok).catch(() => {});
    debug({ state: 'ready' });
    return { startMs: Math.round(this.startSec * 1000) };
  }

  async playClip(durationMs: number, at?: number, onStart?: OnClipStart): Promise<ClipResult> {
    const p = await this.init();
    const tok = ++this.token;
    this.lastError = 0;
    p.pauseVideo();
    // The player is normally parked at the start already; seeking anyway forces a rebuffer and delays the clip.
    if (Math.abs(p.getCurrentTime() - this.startSec) > 0.15) p.seekTo(this.startSec, true);
    p.unMute();
    p.setVolume(100);
    if (at) await sleep(Math.max(0, at - this.latency - performance.now()));
    if (tok !== this.token) return { requestedMs: durationMs, measuredMs: 0 };
    this.state = -1;
    const asked = performance.now();
    p.playVideo();
    try {
      await this.waitFor(() => this.state === PLAYING, 6000, tok);
    } catch {
      if (tok === this.token) p.mute();
      return { requestedMs: durationMs, measuredMs: 0 };
    }
    const t0 = performance.now();
    this.latency = Math.min(400, Math.max(30, this.latency * 0.6 + (t0 - asked) * 0.4));
    onStart?.(t0);
    await sleep(durationMs);
    const measuredMs = Math.round((performance.now() - t0) * 10) / 10;
    // A newer clip (or stop) owns the player now; leave it alone.
    if (tok !== this.token) return { requestedMs: durationMs, measuredMs };
    p.mute();
    p.pauseVideo();
    p.seekTo(this.startSec, true);
    debug({ requestedMs: durationMs, measuredMs });
    return { requestedMs: durationMs, measuredMs };
  }

  stop(): void {
    this.token++;
    if (!this.player) return;
    this.player.mute();
    this.player.pauseVideo();
  }
}

/**
 * YouTube playback with two players: the active one plays clips and is shown at reveal, the standby
 * one loads the next song in the background (muted), so ads and buffering happen while you guess.
 * iOS needs a tap per player before scripted sound, so it keeps a single player.
 */
class YouTubeEngine implements AudioEngine {
  readonly kind = 'youtube' as const;
  private slots: Slot[] = [];
  private cur = 0;
  private unlocked = false;
  autoplayBlocked = false;

  private slot(i: number): Slot {
    return (this.slots[i] ??= new Slot(() => (this.autoplayBlocked = true)));
  }

  /** Players for normal play: active + one standby (iOS: one, each iframe needs its own tap). */
  private get pool(): number {
    return isIOS() ? 1 : 2;
  }

  /** Players allowed when preloading a whole set of clips (sound pick): fewer on phones (memory). */
  get setPool(): number {
    if (isIOS()) return 1;
    return matchMedia('(pointer: coarse)').matches ? 4 : 6;
  }

  /** The active player's element (positioned over the video slot at reveal). */
  get host(): HTMLDivElement {
    return this.slot(this.cur).host;
  }

  setMode(mode: PlayerMode): void {
    this.slots.forEach((s, i) => s.setMode(i === this.cur ? mode : 'hidden'));
    this.slot(this.cur).setMode(mode);
  }

  needsTapUnlock(): boolean {
    return isIOS() && !this.unlocked;
  }

  async unlockWithTap(videoId: string): Promise<void> {
    await this.slot(this.cur).unlockWithTap(videoId);
    this.unlocked = true;
  }

  private target(song: Song, playlist: Pick<Playlist, 'defaultOffsetMs'>, opts: PrepareOptions) {
    if (song.source.type !== 'youtube') throw new SkipSongError('not youtube');
    const startMs = song.startOffsetMs ?? playlist.defaultOffsetMs;
    const videoId = song.source.videoId;
    return { videoId, startMs, key: `${videoId}|${opts.startFrac ?? 'o' + startMs}|${opts.clipSec ?? ''}` };
  }

  private find(key: string): number {
    return this.slots.findIndex((s) => s?.load?.key === key);
  }

  prepare(song: Song, playlist: Pick<Playlist, 'defaultOffsetMs'>, opts: PrepareOptions = {}): Promise<PrepareResult> {
    const { videoId, startMs, key } = this.target(song, playlist, opts);
    const a = this.slot(this.cur);
    const i = this.find(key);
    if (i === this.cur) {
      a.used = performance.now();
      return a.load!.done;
    }
    if (i >= 0) {
      // Another player already has it: make that one active. A muted load in the old one keeps going.
      if (!a.loading) a.stop();
      a.setMode('hidden');
      this.cur = i;
      this.slots[i].used = performance.now();
      return this.slots[i].load!.done;
    }
    return a.start(key, videoId, startMs, opts);
  }

  /** A free player for background loading: never the active one; unused first, then least recently used. */
  private spare(limit: number, keep: Set<string>): Slot | null {
    let best = -1;
    for (let i = 0; i < limit; i++) {
      if (i === this.cur) continue;
      const s = this.slots[i];
      if (!s?.load) return this.slot(i);
      if (keep.has(s.load.key)) continue;
      if (best < 0 || s.used < this.slots[best].used) best = i;
    }
    return best >= 0 ? this.slots[best] : null;
  }

  preload(song: Song, playlist: Pick<Playlist, 'defaultOffsetMs'>, opts: PrepareOptions = {}): void {
    if (this.pool < 2 || song.source.type !== 'youtube') return;
    const { videoId, startMs, key } = this.target(song, playlist, opts);
    if (this.find(key) >= 0) return;
    this.spare(Math.max(this.pool, this.slots.length), new Set())?.start(key, videoId, startMs, opts).catch(() => {});
  }

  /**
   * Loads several songs at once, one muted player each (up to `setPool`), for instant previews.
   * Resolves when all of them settle; `onProgress(done, total)` reports each one.
   */
  preloadSet(songs: Song[], playlist: Pick<Playlist, 'defaultOffsetMs'>, opts: PrepareOptions, onProgress?: (done: number, total: number) => void): Promise<void> {
    const limit = this.setPool;
    const list = songs.filter((s) => s.source.type === 'youtube').slice(0, limit).map((s) => ({ s, ...this.target(s, playlist, opts) }));
    const keep = new Set(list.map((x) => x.key));
    const jobs: Promise<unknown>[] = [];
    // The active player may take one too when it is idle and holds nothing we want.
    const c = this.slot(this.cur);
    let curFree = !c.loading && (!c.load || !keep.has(c.load.key));
    for (const x of list) {
      const i = this.find(x.key);
      if (i >= 0) {
        jobs.push(this.slots[i].load!.done);
        continue;
      }
      const slot = curFree ? c : this.spare(limit, keep);
      curFree = false;
      if (!slot) break;
      jobs.push(slot.start(x.key, x.videoId, x.startMs, opts));
    }
    let done = 0;
    onProgress?.(0, jobs.length);
    return Promise.all(jobs.map((j) => j.catch(() => {}).then(() => onProgress?.(++done, jobs.length)))).then(() => {});
  }

  playClip(durationMs: number, at?: number, onStart?: OnClipStart): Promise<ClipResult> {
    const s = this.slot(this.cur);
    s.used = performance.now();
    return s.playClip(durationMs, at, onStart);
  }

  stop(): void {
    this.slots[this.cur]?.stop();
  }

  /** Stops every player, including background loads (leaving a game or room). */
  stopAll(): void {
    this.slots.forEach((s) => {
      s.stop();
      s.load = null;
      s.loading = false;
    });
  }
}

let instance: YouTubeEngine | null = null;
/** The YouTube engine (two players in the DOM, never moved). */
export function youtubeEngine(): YouTubeEngine {
  instance ??= new YouTubeEngine();
  return instance;
}
