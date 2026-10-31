import type { Playlist, Song } from '../core/types';

export interface ClipResult {
  requestedMs: number;
  /** Wall-clock time the audio was actually unmuted/playing (exact for local, approximate for YouTube). */
  measuredMs: number;
}

export interface PrepareResult {
  /** Resolved clip start within the song, ms. */
  startMs: number;
}

export interface PrepareOptions {
  /** Start at this fraction of the song instead of the opening ("Đoạn bất kỳ", previews). */
  startFrac?: number | null;
  /** Longest clip that will be played from the start point, seconds (keeps random starts inside the song). */
  clipSec?: number;
}

/** Called with the performance.now() time the clip starts (may be slightly in the future). */
export type OnClipStart = (at: number) => void;

/** Thrown when a song cannot be played and should be skipped. */
export class SkipSongError extends Error {}

export interface AudioEngine {
  readonly kind: 'youtube' | 'local';
  /** Loads the song and parks it at its start point. Rejects with SkipSongError for unplayable songs. */
  prepare(song: Song, playlist: Pick<Playlist, 'defaultOffsetMs'>, opts?: PrepareOptions): Promise<PrepareResult>;
  /** Loads a song likely to be needed next in the background (best effort). */
  preload(song: Song, playlist: Pick<Playlist, 'defaultOffsetMs'>, opts?: PrepareOptions): void;
  /** Plays `durationMs` from the prepared start. `at` = performance.now() timestamp to start at (optional). */
  playClip(durationMs: number, at?: number, onStart?: OnClipStart): Promise<ClipResult>;
  stop(): void;
}
