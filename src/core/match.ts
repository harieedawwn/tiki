/** Pure multiplayer match rules (no Firebase, no DOM). */
import { pointsForStage, speedBonus } from './scoring';
import { clampChoices } from './modes';
import type { GameKind, PresetId } from './types';

export const MAX_PLAYERS = 12;
export const ROOM_CODE_LENGTH = 5;
/** No 0/O, 1/I/L. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/;

export function makeRoomCode(rand: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) s += ROOM_CODE_ALPHABET[Math.floor(rand() * ROOM_CODE_ALPHABET.length)];
  return s;
}

export function normalizeRoomCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_LENGTH);
}

export type MatchMode = 'classic' | 'race' | 'elim';

export interface MatchSettings {
  rounds: number;
  mode: MatchMode;
  /** Race mode target score. */
  target: number;
  /** Elimination mode: eliminate the lowest player after every N rounds. */
  elimEvery: number;
  presetId: PresetId;
  /** Guess time after each clip finishes, seconds. */
  intervalSec: number;
  cooldownSec: 0 | 2 | 5;
  speedBonus: boolean;
}

export const DEFAULT_MATCH: MatchSettings = {
  rounds: 10, mode: 'classic', target: 5000, elimEvery: 3, presetId: 'tichtac', intervalSec: 7, cooldownSec: 2, speedBonus: true,
};

export function clampSettings(s: MatchSettings): MatchSettings {
  const n = (v: number, lo: number, hi: number, d: number) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);
  return {
    ...s,
    rounds: n(s.rounds, 1, 50, 10),
    target: n(s.target, 500, 20000, 5000),
    elimEvery: n(s.elimEvery, 1, 10, 3),
    intervalSec: n(s.intervalSec, 3, 20, 7),
    cooldownSec: ([0, 2, 5] as const).includes(s.cooldownSec) ? s.cooldownSec : 2,
  };
}

/** auto: rounds start and advance on timers; manual: the host taps "Bắt đầu" / "Bài tiếp". */
export type Flow = 'auto' | 'manual';

/** Extra room options, stored in meta/opts (kept apart from meta/settings, whose shape the rules fix). */
export interface RoomOpts {
  kind: GameKind;
  /** cover/sound: choices per round. */
  choices: number;
  flow: Flow;
  /** auto: seconds the answer stays on screen. */
  revealSec: number;
}

export const DEFAULT_OPTS: RoomOpts = { kind: 'classic', choices: 20, flow: 'auto', revealSec: 6 };
export const REVEAL_CHOICES = [4, 6, 10, 15];

export function clampOpts(o: Partial<RoomOpts> | null | undefined): RoomOpts {
  const v = { ...DEFAULT_OPTS, ...(o ?? {}) };
  const kind: GameKind = (['classic', 'random', 'cover', 'sound'] as const).includes(v.kind) ? v.kind : 'classic';
  return {
    kind,
    choices: clampChoices(kind, v.choices),
    flow: v.flow === 'manual' ? 'manual' : 'auto',
    revealSec: Math.min(30, Math.max(3, Math.round(v.revealSec) || 6)),
  };
}

/** Countdown before every clip, so all players start together. */
export const LEAD_MS = 3000;

/** A stage lasts its clip plus the guess time; the next one starts after that. */
export const stageWindowMs = (stageSec: number, s: Pick<MatchSettings, 'intervalSec'>) => Math.round(stageSec * 1000) + s.intervalSec * 1000;

export function guessPoints(stage: number, elapsedMs: number, intervalMs: number, withBonus: boolean): number {
  return pointsForStage(stage) + (withBonus ? speedBonus(elapsedMs, intervalMs) : 0);
}

export interface Standing {
  id: string;
  score: number;
  joinedAt: number;
}

/** Sorted by score desc (then join order); tied scores share a rank (1-based). */
export function rankPlayers<T extends Standing>(players: T[]): (T & { rank: number })[] {
  const sorted = players.slice().sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt);
  let rank = 0, prev = NaN;
  return sorted.map((p, i) => {
    if (p.score !== prev) rank = i + 1;
    prev = p.score;
    return { ...p, rank };
  });
}

/** Positive = moved up. Players missing from `before` count as unchanged. */
export function rankChanges<T extends Standing>(players: T[], before: Record<string, number>): Record<string, number> {
  const now = rankPlayers(players);
  const prev = rankPlayers(players.map((p) => ({ ...p, score: before[p.id] ?? p.score })));
  const prevRank = new Map(prev.map((p) => [p.id, p.rank]));
  return Object.fromEntries(now.map((p) => [p.id, (prevRank.get(p.id) ?? p.rank) - p.rank]));
}

/** Lowest score is eliminated; ties go to the player who joined last. */
export function pickEliminated<T extends Standing>(active: T[]): T | null {
  if (active.length <= 1) return null;
  const r = rankPlayers(active);
  const lowest = r[r.length - 1].score;
  return r.filter((p) => p.score === lowest).sort((a, b) => b.joinedAt - a.joinedAt)[0];
}

export type Outcome = { end: false } | { end: true; leaders: string[] };

/**
 * Decides after each round whether the match ends. `leaders` with more than one id means a tie
 * for first, which the caller resolves with a sudden-death song (if songs remain).
 */
export function matchOutcome(
  s: MatchSettings,
  roundsPlayed: number,
  songsLeft: number,
  active: Standing[],
): Outcome {
  const ranked = rankPlayers(active);
  const top = ranked.filter((p) => p.rank === 1).map((p) => p.id);
  if (!ranked.length) return { end: true, leaders: [] };
  if (s.mode === 'race' && ranked[0].score >= s.target) return { end: true, leaders: top };
  if (s.mode === 'elim' && active.length <= 1) return { end: true, leaders: top };
  if (roundsPlayed >= s.rounds || songsLeft <= 0) return { end: true, leaders: top };
  return { end: false };
}

export const isElimRound = (s: MatchSettings, roundsPlayed: number) => s.mode === 'elim' && roundsPlayed > 0 && roundsPlayed % s.elimEvery === 0;

/** Host failover: the earliest-joined connected player. */
export function pickNextHost<T extends Standing & { connected: boolean }>(players: T[]): T | null {
  return players.filter((p) => p.connected).sort((a, b) => a.joinedAt - b.joinedAt)[0] ?? null;
}
