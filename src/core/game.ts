import { pointsForStage } from './scoring';
import type { GameState, RoundResult } from './types';

export function shuffle<T>(arr: T[], rand: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createGame(playlistId: string, songIds: string[], count: number | 'all', stages: number[]): GameState {
  const queue = shuffle(songIds).slice(0, count === 'all' ? songIds.length : count);
  return {
    playlistId, queue, index: 0, stage: 0, stages, phase: 'preparing',
    score: 0, streak: 0, bestStreak: 0, results: [], wrongGuesses: [],
  };
}

export const currentSongId = (s: GameState): string | undefined => s.queue[s.index];
export const isLastStage = (s: GameState): boolean => s.stage >= s.stages.length - 1;

export function markReady(s: GameState): GameState {
  return s.phase === 'preparing' ? { ...s, phase: 'ready' } : s;
}

function finishRound(s: GameState, correct: boolean): GameState {
  const points = correct ? pointsForStage(s.stage) : 0;
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

export function guess(s: GameState, songId: string): GameState {
  if (s.phase !== 'ready') return s;
  if (songId === currentSongId(s)) return finishRound(s, true);
  const wrong = { ...s, wrongGuesses: [...s.wrongGuesses, songId] };
  return isLastStage(s) ? finishRound(wrong, false) : { ...wrong, stage: s.stage + 1 };
}

/** Drops the current song (player error) without scoring. */
export function skipBroken(s: GameState): GameState {
  const queue = s.queue.filter((_, i) => i !== s.index);
  const next: GameState = { ...s, queue, stage: 0, wrongGuesses: [], phase: 'preparing' };
  return next.index >= queue.length ? { ...next, phase: 'end' } : next;
}

export function nextSong(s: GameState): GameState {
  if (s.phase !== 'reveal') return s;
  const index = s.index + 1;
  if (index >= s.queue.length) return { ...s, phase: 'end' };
  return { ...s, index, stage: 0, wrongGuesses: [], phase: 'preparing' };
}
