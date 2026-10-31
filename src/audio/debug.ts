/** Tiny store feeding the dev debug overlay. */
export interface DebugInfo {
  engine?: string;
  state?: string;
  startMs?: number;
  requestedMs?: number;
  measuredMs?: number;
  note?: string;
}

let info: DebugInfo = {};
const listeners = new Set<() => void>();

export const getDebug = () => info;
export const subscribeDebug = (fn: () => void) => (listeners.add(fn), () => listeners.delete(fn));
export function debug(patch: DebugInfo): void {
  info = { ...info, ...patch };
  listeners.forEach((f) => f());
}
