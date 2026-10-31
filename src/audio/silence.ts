export interface SilenceOptions {
  thresholdDb: number;
  prerollMs: number;
  windowMs?: number;
  holdMs?: number;
  maxTrimMs?: number;
}

/**
 * First point where RMS over 10 ms windows stays above the threshold for 30 ms, minus the pre-roll.
 * Capped at maxTrimMs (8 s); 0 if nothing is found.
 */
export function detectStartMs(channels: Float32Array[], sampleRate: number, o: SilenceOptions): number {
  const windowMs = o.windowMs ?? 10, holdMs = o.holdMs ?? 30, maxTrimMs = o.maxTrimMs ?? 8000;
  const win = Math.max(1, Math.round((sampleRate * windowMs) / 1000));
  const need = Math.max(1, Math.round(holdMs / windowMs));
  const thr = Math.pow(10, o.thresholdDb / 20);
  const thr2 = thr * thr;
  const len = channels[0]?.length ?? 0;
  const limit = Math.min(len, Math.round(((maxTrimMs + holdMs) * sampleRate) / 1000));
  let run = 0;
  for (let w = 0; (w + 1) * win <= limit; w++) {
    let sum = 0;
    for (let i = w * win; i < (w + 1) * win; i++) {
      let v = 0;
      for (const ch of channels) v += ch[i];
      v /= channels.length;
      sum += v * v;
    }
    if (sum / win > thr2) {
      if (++run >= need) {
        const startMs = ((w - need + 1) * win * 1000) / sampleRate;
        return Math.min(Math.max(0, startMs - o.prerollMs), maxTrimMs);
      }
    } else run = 0;
  }
  return 0;
}

/** Peak envelope (0..1) for drawing a waveform of the first `spanMs`. */
export function peaks(channel: Float32Array, sampleRate: number, spanMs: number, bins: number): number[] {
  const n = Math.min(channel.length, Math.round((spanMs * sampleRate) / 1000));
  const per = Math.max(1, Math.floor(n / bins));
  const out: number[] = [];
  for (let b = 0; b < bins; b++) {
    let m = 0;
    for (let i = b * per; i < Math.min(n, (b + 1) * per); i++) m = Math.max(m, Math.abs(channel[i]));
    out.push(m);
  }
  return out;
}
