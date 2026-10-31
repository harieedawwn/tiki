/** Game kinds shared by solo and multiplayer, plus their pure helpers. */
import type { GameKind } from './types';

export interface KindInfo {
  id: GameKind;
  name: string;
  desc: string;
}

export const GAME_KINDS: KindInfo[] = [
  { id: 'classic', name: 'Cổ điển', desc: 'Nghe đoạn mở đầu, tìm tên bài.' },
  { id: 'random', name: 'Đoạn bất kỳ', desc: 'Một đoạn ngẫu nhiên giữa bài.' },
  { id: 'cover', name: 'Nghe nhạc, chọn ảnh', desc: 'Nghe rồi chọn đúng ảnh bìa.' },
  { id: 'sound', name: 'Xem ảnh, chọn nhạc', desc: 'Nhìn ảnh bìa, nghe các đoạn số.' },
];
export const kindInfo = (k: GameKind) => GAME_KINDS.find((x) => x.id === k) ?? GAME_KINDS[0];

/** Cover pick: how many covers are offered (max 40). */
export const COVER_CHOICES = [12, 20, 40];
export const MAX_COVER_CHOICES = 40;
/** Sound pick: how many numbered clips are offered (max 20). */
export const SOUND_CHOICES = [4, 6, 10, 20];
export const MAX_SOUND_CHOICES = 20;
/** Sound pick: points by wrong picks before the right one; the round ends after the last. */
export const SOUND_POINTS = [1000, 500, 250];
export const SOUND_PREVIEW_SEC = 4;
/** Sound pick previews start this far into the song (choruses are more recognisable than intros). */
export const SOUND_PREVIEW_FRAC = 0.3;
/** Multiplayer sound pick: time to listen and choose. */
export const SOUND_WINDOW_SEC = 25;

export const soundPoints = (wrong: number) => SOUND_POINTS[Math.min(Math.max(wrong, 0), SOUND_POINTS.length - 1)];

export const clampChoices = (kind: GameKind, n: number) =>
  kind === 'sound' ? Math.min(MAX_SOUND_CHOICES, Math.max(2, Math.round(n) || 6)) : Math.min(MAX_COVER_CHOICES, Math.max(4, Math.round(n) || 20));

export function shuffle<T>(arr: T[], rand: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** `n` items from `pool` that always include `answer`, shuffled. */
export function pickOptions<T>(pool: T[], answer: T, n: number, rand: () => number = Math.random): T[] {
  const others = shuffle(pool.filter((x) => x !== answer), rand).slice(0, Math.max(0, n - 1));
  return shuffle([...others, answer], rand);
}

/** Position for "Đoạn bất kỳ" as a fraction of the song, resolved once the duration is known. */
export const randomStartFrac = (rand: () => number = Math.random) => 0.12 + rand() * 0.6;

/** Start second for a fraction, keeping the longest clip (plus a margin) inside the song. */
export function startFromFrac(frac: number, durationSec: number, clipSec: number): number {
  const max = durationSec - clipSec - 1;
  if (!(max > 0)) return 0;
  return Math.min(max, Math.max(Math.min(5, max), frac * durationSec));
}
