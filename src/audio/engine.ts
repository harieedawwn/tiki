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

/** Thrown when a song cannot be played and should be skipped. */
export class SkipSongError extends Error {}

export interface AudioEngine {
  readonly kind: 'youtube' | 'local';
  /** Loads the song and parks it at its start point. Rejects with SkipSongError for unplayable songs. */
  prepare(song: Song, playlist: Pick<Playlist, 'defaultOffsetMs'>): Promise<PrepareResult>;
  /** Plays `durationMs` from the prepared start. `at` = performance.now() timestamp to start at (optional). */
  playClip(durationMs: number, at?: number): Promise<ClipResult>;
  stop(): void;
}
