export type SongSource =
  | { type: 'youtube'; videoId: string }
  | { type: 'local'; fileKey: string };

export interface Song {
  id: string;
  title: string;
  artist: string;
  /** Image URL (YouTube thumbnail) or data URL (local, downscaled). Empty if none. */
  cover: string;
  source: SongSource;
  /** Manual clip start in ms. null = automatic (playlist default for YouTube, detected start for local). */
  startOffsetMs: number | null;
  /** Local files only: last detected start of the music, in ms. */
  detectedStartMs?: number;
}

export interface Playlist {
  id: string;
  name: string;
  kind: 'youtube' | 'local';
  songs: Song[];
  /** YouTube: absolute start used when a song has no own offset. Local: added to the detected start. */
  defaultOffsetMs: number;
  bestScore: number;
  createdAt: number;
  youtubeListId?: string;
}

export type PresetId = 'tichtac' | 'thuong';

export interface Preset {
  id: PresetId;
  name: string;
  /** Six stage lengths in seconds. */
  stages: number[];
}

export type Phase = 'preparing' | 'ready' | 'reveal' | 'end';

export interface RoundResult {
  songId: string;
  correct: boolean;
  /** Stage index (0-5) at which the round ended. */
  stage: number;
  points: number;
}

export interface GameState {
  playlistId: string;
  queue: string[];
  index: number;
  stage: number;
  stages: number[];
  phase: Phase;
  score: number;
  streak: number;
  bestStreak: number;
  results: RoundResult[];
  /** Song ids guessed wrong in the current round. */
  wrongGuesses: string[];
}
