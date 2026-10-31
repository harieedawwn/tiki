import { DEV_CODE_SHA256 } from '../config';
import { DEFAULT_PRESETS } from '../core/stages';
import type { Preset, PresetId } from '../core/types';

export interface Settings {
  devUnlocked: boolean;
  debugOverlay: boolean;
  presets: Record<PresetId, Preset>;
  /** LocalEngine silence detection threshold, dBFS. */
  silenceThresholdDb: number;
  /** Kept before the detected start so the first attack survives, ms. */
  prerollMs: number;
}

const KEY = 'tiki.settings';
const DEFAULTS: Settings = {
  devUnlocked: false,
  debugOverlay: false,
  presets: DEFAULT_PRESETS,
  silenceThresholdDb: -45,
  prerollMs: 20,
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
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
