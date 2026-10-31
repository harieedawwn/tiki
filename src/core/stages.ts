import type { Preset, PresetId } from './types';

export const MIN_STAGES = 3;
export const MAX_STAGES = 8;

export const DEFAULT_PRESETS: Record<PresetId, Preset> = {
  tichtac: { id: 'tichtac', name: 'Chuẩn', stages: [0.5, 1, 2, 6, 12] },
  thuong: { id: 'thuong', name: 'Siêu ngắn', stages: [0.1, 0.25, 0.5, 1, 3] },
};

export function formatSeconds(s: number): string {
  if (s < 0.1) return `${Math.round(s * 1000)} ms`;
  return `${s.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} s`;
}

/** Validates a user-edited stage list: 3-8 positive, increasing numbers. */
export function validStages(stages: number[]): boolean {
  return (
    stages.length >= MIN_STAGES && stages.length <= MAX_STAGES &&
    stages.every((s, i) => Number.isFinite(s) && s > 0 && s <= 30 && (i === 0 || s > stages[i - 1]))
  );
}
