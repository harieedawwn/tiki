import { DEV_CODE_SHA256 } from '../config';
import { DEFAULT_PRESETS, PRESET_ORDER, isPresetId, validStages } from '../core/stages';
import type { GameKind, Preset, PresetId } from '../core/types';

export type ThemeId = 'night' | 'ocean' | 'grape' | 'rose' | 'ink' | 'paper';

export interface ThemeInfo {
  id: ThemeId;
  name: string;
  bg: string;
  surface: string;
  accent: string;
  good: string;
}

/** Swatches for the picker and the browser theme-color; the full token sets live in styles.css. */
export const THEMES: ThemeInfo[] = [
  { id: 'night', name: 'Đêm', bg: '#0e1024', surface: '#191c3b', accent: '#7b6dff', good: '#38d39f' },
  { id: 'ocean', name: 'Biển sâu', bg: '#06182a', surface: '#0e2741', accent: '#3fa9ff', good: '#3be0b0' },
  { id: 'grape', name: 'Nho', bg: '#170f2c', surface: '#22183f', accent: '#b28dff', good: '#4fd8a5' },
  { id: 'rose', name: 'Hồng đêm', bg: '#1d0f1c', surface: '#2a1628', accent: '#ff7aa8', good: '#5fd6a4' },
  { id: 'ink', name: 'Mực', bg: '#101113', surface: '#1b1c20', accent: '#e9e7ff', good: '#5ad6a0' },
  { id: 'paper', name: 'Sáng', bg: '#f2f3fa', surface: '#ffffff', accent: '#5446e8', good: '#0f9d74' },
];

export interface LastGame {
  kind: GameKind;
  count: number | 'all';
  preset: PresetId;
  coverChoices: number;
  soundChoices: number;
}

export interface Settings {
  devUnlocked: boolean;
  debugOverlay: boolean;
  presets: Record<PresetId, Preset>;
  /** LocalEngine silence detection threshold, dBFS. */
  silenceThresholdDb: number;
  /** Kept before the detected start so the first attack survives, ms. */
  prerollMs: number;
  theme: ThemeId;
  /** UI sound effects. */
  sfx: boolean;
  sfxVolume: number;
  /** Multiplayer: keep hearing the clips after you guessed right (spectating). */
  listenSpectating: boolean;
  lastGame: LastGame;
}

const KEY = 'tiki.settings';
const DEFAULTS: Settings = {
  devUnlocked: false,
  debugOverlay: false,
  presets: DEFAULT_PRESETS,
  silenceThresholdDb: -45,
  prerollMs: 20,
  theme: 'night',
  sfx: true,
  sfxVolume: 0.7,
  listenSpectating: true,
  lastGame: { kind: 'classic', count: 10, preset: 'tichtac', coverChoices: 20, soundChoices: 6 },
};

/** Applies the theme tokens and the browser chrome color. */
export function applyTheme(id: ThemeId): void {
  const t = THEMES.find((x) => x.id === id) ?? THEMES[0];
  document.documentElement.dataset.theme = t.id;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', t.bg));
}

/** Per-key merge with the defaults: older stored versions lack newer presets; invalid stage lists are dropped. */
function mergePresets(stored: unknown): Record<PresetId, Preset> {
  const src = (stored && typeof stored === 'object' ? stored : {}) as Partial<Record<PresetId, Partial<Preset>>>;
  const out = { ...DEFAULT_PRESETS };
  for (const id of PRESET_ORDER) {
    const st = src[id]?.stages;
    if (Array.isArray(st) && validStages(st)) out[id] = { ...DEFAULT_PRESETS[id], stages: st };
  }
  return out;
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const stored = JSON.parse(raw);
    const merged: Settings = { ...DEFAULTS, ...stored, presets: mergePresets(stored.presets) };
    merged.lastGame = { ...DEFAULTS.lastGame, ...stored.lastGame };
    if (!isPresetId(merged.lastGame.preset)) merged.lastGame.preset = 'tichtac';
    return merged;
  } catch {
    return DEFAULTS;
  }
}

let current = load();
const listeners = new Set<() => void>();

export const getSettings = () => current;
export const subscribeSettings = (fn: () => void) => (listeners.add(fn), () => listeners.delete(fn));

export function updateSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage unavailable: keep in memory */
  }
  listeners.forEach((f) => f());
}

export function resetSettingsInMemory(): void {
  current = DEFAULTS;
  listeners.forEach((f) => f());
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function tryUnlockDev(code: string): Promise<boolean> {
  const ok = (await sha256Hex(code.trim())) === DEV_CODE_SHA256;
  if (ok) updateSettings({ devUnlocked: true });
  return ok;
}
