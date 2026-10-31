import { pickOptions, randomStartFrac, shuffle, soundPoints } from './modes';
import { pointsForStage } from './scoring';
import type { GameKind, GameState, RoundResult } from './types';

export { shuffle };

/** Sound pick: three attempts, modelled as three "stages". */
export const SOUND_STAGES = [4, 4, 4];

export function createGame(
  playlistId: string, songIds: string[], count: number | 'all', stages: number[],
  kind: GameKind = 'classic', choices = 0, pool: string[] = songIds,
): GameState {
  const queue = shuffle(songIds).slice(0, count === 'all' ? songIds.length : count);
  return withOptions({
    playlistId, queue, index: 0, stage: 0, stages: kind === 'sound' ? SOUND_STAGES : stages, phase: 'preparing',
    score: 0, streak: 0, bestStreak: 0, results: [], wrongGuesses: [],
    kind, choices, pool, options: [], fracs: queue.map(() => randomStartFrac()),
  });
}

/** Draws this round's choices (cover/sound kinds). */
function withOptions(s: GameState): GameState {
  const cur = s.queue[s.index];
  if ((s.kind !== 'cover' && s.kind !== 'sound') || !cur) return { ...s, options: [] };
  return { ...s, options: pickOptions(s.pool, cur, s.choices) };
}

export const currentSongId = (s: GameState): string | undefined => s.queue[s.index];
export const isLastStage = (s: GameState): boolean => s.stage >= s.stages.length - 1;
export const roundPoints = (s: Pick<GameState, 'kind' | 'stage'>) => (s.kind === 'sound' ? soundPoints(s.stage) : pointsForStage(s.stage));

export function markReady(s: GameState): GameState {
  return s.phase === 'preparing' ? { ...s, phase: 'ready' } : s;
}

function finishRound(s: GameState, correct: boolean): GameState {
  const points = correct ? roundPoints(s) : 0;
  const streak = correct ? s.streak + 1 : 0;
  const result: RoundResult = { songId: s.queue[s.index], correct, stage: s.stage, points };
  return {
    ...s, phase: 'reveal', score: s.score + points, streak,
    bestStreak: Math.max(s.bestStreak, streak), results: [...s.results, result],
  };
}

/** "Thêm một chút": next stage; on the last stage it gives up and reveals. */
export function moreTime(s: GameState): GameState {
  if (s.phase !== 'ready') return s;
  return isLastStage(s) ? finishRound(s, false) : { ...s, stage: s.stage + 1 };
}

export const giveUp = (s: GameState): GameState => (s.phase === 'ready' ? finishRound(s, false) : s);

export function guess(s: GameState, songId: string): GameState {
  if (s.phase !== 'ready') return s;
  if (songId === currentSongId(s)) return finishRound(s, true);
  const wrong = { ...s, wrongGuesses: [...s.wrongGuesses, songId] };
  return isLastStage(s) ? finishRound(wrong, false) : { ...wrong, stage: s.stage + 1 };
}

/** Drops the current song (player error) without scoring. */
export function skipBroken(s: GameState): GameState {
  const queue = s.queue.filter((_, i) => i !== s.index);
  const fracs = s.fracs.filter((_, i) => i !== s.index);
  const next: GameState = { ...s, queue, fracs, stage: 0, wrongGuesses: [], phase: 'preparing' };
  return next.index >= queue.length ? { ...next, phase: 'end' } : withOptions(next);
}

export function nextSong(s: GameState): GameState {
  if (s.phase !== 'reveal') return s;
  const index = s.index + 1;
  if (index >= s.queue.length) return { ...s, phase: 'end' };
  return withOptions({ ...s, index, stage: 0, wrongGuesses: [], phase: 'preparing' });
}
