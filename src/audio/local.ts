import { startFromFrac } from '../core/modes';
import type { Playlist, Song } from '../core/types';
import { getSettings } from '../data/settings';
import { debug } from './debug';
import { SkipSongError, type AudioEngine, type ClipResult, type OnClipStart, type PrepareOptions, type PrepareResult } from './engine';
import { detectStartMs } from './silence';

/** Files picked in this browser session, by fileKey ("name:size"). Not persisted. */
const files = new Map<string, File>();

export function registerFiles(list: File[]): void {
  for (const f of list) files.set(`${f.name}:${f.size}`, f);
}

export const hasFile = (song: Song) => song.source.type === 'local' && files.has(song.source.fileKey);

const FADE = 0.002;

class LocalEngine implements AudioEngine {
  readonly kind = 'local' as const;
  private ctx: AudioContext | null = null;
  private cache = new Map<string, Promise<AudioBuffer>>();
  private buffer: AudioBuffer | null = null;
  private startSec = 0;
  private playing: AudioBufferSourceNode | null = null;

  /** Call from a user gesture so the context may start. */
  context(): AudioContext {
    this.ctx ??= new AudioContext();
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  decode(song: Song): Promise<AudioBuffer> {
    if (song.source.type !== 'local') return Promise.reject(new SkipSongError('not local'));
    const key = song.source.fileKey;
    let p = this.cache.get(key);
    if (!p) {
      const f = files.get(key);
      if (!f) return Promise.reject(new SkipSongError('Chưa chọn lại tệp cho bài này'));
      p = f.arrayBuffer().then((ab) => this.context().decodeAudioData(ab));
      p.catch(() => this.cache.delete(key));
      this.cache.set(key, p);
      // Keep the cache small: drop the oldest entries.
      while (this.cache.size > 4) this.cache.delete(this.cache.keys().next().value!);
    }
    return p;
  }

  detect(buf: AudioBuffer): number {
    const s = getSettings();
    const chans = Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i));
    return detectStartMs(chans, buf.sampleRate, { thresholdDb: s.silenceThresholdDb, prerollMs: s.prerollMs });
  }

  async prepare(song: Song, playlist: Pick<Playlist, 'defaultOffsetMs'>, opts: PrepareOptions = {}): Promise<PrepareResult> {
    let buf: AudioBuffer;
    try {
      buf = await this.decode(song);
    } catch (e) {
      throw e instanceof SkipSongError ? e : new SkipSongError('Không giải mã được tệp');
    }
    const detected = this.detect(buf);
    song.detectedStartMs = detected;
    const startMs = opts.startFrac != null
      ? startFromFrac(opts.startFrac, buf.duration, opts.clipSec ?? 12) * 1000
      : song.startOffsetMs ?? detected + playlist.defaultOffsetMs;
    this.buffer = buf;
    this.startSec = Math.min(Math.max(0, startMs / 1000), Math.max(0, buf.duration - 0.05));
    debug({ engine: 'local', state: 'ready', startMs });
    return { startMs };
  }

  /** Background-decode a song likely to be needed next. */
  preload(song: Song, _playlist?: unknown, _opts?: PrepareOptions): void {
    if (hasFile(song)) this.decode(song).catch(() => {});
  }

  playBuffer(buf: AudioBuffer, offsetSec: number, durationMs: number, at?: number, onStart?: OnClipStart): Promise<ClipResult> {
    this.stop();
    const ctx = this.context();
    const dur = durationMs / 1000;
    const delay = at ? Math.max(0, (at - performance.now()) / 1000) : 0;
    const t = ctx.currentTime + 0.01 + delay;
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    const fade = Math.min(FADE, dur / 2);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + fade);
    g.gain.setValueAtTime(1, t + dur - fade);
    g.gain.linearRampToValueAtTime(0, t + dur);
    src.buffer = buf;
    src.connect(g).connect(ctx.destination);
    src.start(t, offsetSec, dur);
    this.playing = src;
    onStart?.(performance.now() + (t - ctx.currentTime) * 1000);
    debug({ requestedMs: durationMs, measuredMs: durationMs });
    return new Promise((resolve) => {
      src.onended = () => resolve({ requestedMs: durationMs, measuredMs: durationMs });
    });
  }

  playClip(durationMs: number, at?: number, onStart?: OnClipStart): Promise<ClipResult> {
    if (!this.buffer) return Promise.reject(new Error('not prepared'));
    return this.playBuffer(this.buffer, this.startSec, durationMs, at, onStart);
  }

  stop(): void {
    try {
      this.playing?.stop();
    } catch {
      /* already stopped */
    }
    this.playing = null;
  }
}

export const localEngine = new LocalEngine();
