import type { MatchSettings, RoomOpts } from '../core/match';
import type { GameKind, SongSource } from '../core/types';

export type RoomStatus = 'lobby' | 'playing' | 'paused' | 'ended';

export interface RoomMeta {
  hostId: string;
  mods?: Record<string, true>;
  locked: boolean;
  status: RoomStatus;
  createdAt: number;
  settings: MatchSettings;
  /** Game kind, choices and flow (absent in older rooms: defaults). */
  opts?: RoomOpts | null;
  kicked?: Record<string, true>;
  winners?: string[] | null;
  /** Player ids in the current sudden-death round. */
  suddenDeath?: string[] | null;
  pausedAt?: number | null;
}

export interface RoomPlayer {
  name: string;
  score: number;
  connected: boolean;
  joinedAt: number;
  eliminated?: boolean | null;
}

/** Song as shown to every player: no source, so the guess list does not leak the answer. */
export interface RoomSong {
  id: string;
  title: string;
  artist: string;
  cover: string;
}

export interface RoomPlaylist {
  id: string;
  name: string;
  kind: 'youtube' | 'local';
  songs: RoomSong[];
}

export type RoundPhase = 'loading' | 'playing' | 'reveal';

export interface RoundResult {
  points: number;
  stage: number;
  at: number;
}

export interface RoundState {
  /** 0-based round number (sudden death continues the count). */
  index: number;
  phase: RoundPhase;
  stage: number;
  /** Stage lengths in seconds, fixed for the match. */
  stages: number[];
  /** Server time at which every client plays the current stage. */
  stageStartAt: number;
  loadingSince: number;
  videoId?: string | null;
  startMs?: number | null;
  /** Local songs: one base64 WAV (16-bit mono 22.05 kHz) per stage. */
  clips?: string[] | null;
  /** pid -> round index the client prepared. */
  ready?: Record<string, number>;
  results?: Record<string, RoundResult>;
  wrong?: Record<string, { n: number; at: number }>;
  /** Song id, written only at reveal. */
  answer?: string | null;
  revealUntil?: number | null;
  scoresBefore?: Record<string, number>;
  suddenDeath?: boolean;
  eliminated?: string | null;
  kind?: GameKind;
  /** random: start fraction every client resolves against the song length. */
  startFrac?: number | null;
  /** cover/sound: indexes into playlist.songs offered this round (includes the answer). */
  options?: number[] | null;
  /** sound: YouTube video ids of the options, same order. */
  optionVideos?: string[] | null;
  /** sound: the cover shown as the question. */
  cover?: string | null;
  /** pid -> stage the player voted to skip; all active players on the current stage = skip it. */
  skipVotes?: Record<string, number> | null;
}

/** A thrown sticker: preset id, or "c:<id>" for a custom one in /stickers/{pid}. */
export interface Emote {
  pid: string;
  k: string;
  at: number;
}

/** Host-only bookkeeping, kept in the database so a new host can continue. Client-side privacy only. */
export interface HostState {
  /** Shuffled indexes into playlist.songs. */
  queue?: number[];
  /** Next queue position to use. */
  pos?: number;
  /** Index into playlist.songs of the current song. */
  current?: number | null;
  sources?: (SongSource & { startOffsetMs: number | null })[];
  defaultOffsetMs?: number;
}

export interface HistoryEntry {
  index: number;
  songId: string;
  title: string;
  artist: string;
  cover: string;
  suddenDeath?: boolean;
  results?: Record<string, RoundResult>;
}

export interface Guess {
  pid: string;
  songId: string;
  at: number;
}

export type CommandType = 'skip' | 'pause' | 'resume' | 'end';

export interface Room {
  meta: RoomMeta;
  players?: Record<string, RoomPlayer>;
  playlist?: RoomPlaylist | null;
  round?: RoundState | null;
  hostState?: HostState | null;
  history?: Record<string, HistoryEntry> | null;
  guesses?: Record<string, Record<string, Guess>> | null;
  commands?: Record<string, { type: CommandType; by: string }> | null;
  emotes?: Record<string, Emote> | null;
  /** pid -> sticker id -> 160 px square image (data URL). */
  stickers?: Record<string, Record<string, string>> | null;
}

export interface FeaturedPlaylist {
  id: string;
  name: string;
  kind: 'youtube' | 'local';
  publishedAt: number;
  /** Full songs with sources and offsets, so anyone can play them. */
  songs: import('../core/types').Song[];
  defaultOffsetMs: number;
}
