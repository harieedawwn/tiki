/**
 * Small synthesized UI sounds (no files): soft sine/triangle tones with short envelopes, a gentle
 * low-pass and a little room reverb. Quiet by design; volume and on/off live in settings.
 */
import { getSettings } from '../data/settings';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let dry: GainNode | null = null;
let wet: GainNode | null = null;

function graph(): AudioContext | null {
  const s = getSettings();
  if (!s.sfx || s.sfxVolume <= 0) return null;
  if (!ctx) {
    try {
      ctx = new AudioContext({ latencyHint: 'interactive' });
    } catch {
      return null;
    }
    master = ctx.createGain();
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 6500;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    master.connect(tone).connect(comp).connect(ctx.destination);
    dry = ctx.createGain();
    dry.connect(master);
    wet = ctx.createGain();
    wet.gain.value = 0.18;
    const verb = ctx.createConvolver();
    verb.buffer = impulse(ctx, 0.7);
    wet.connect(verb).connect(master);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  master!.gain.value = 0.55 * s.sfxVolume;
  return ctx;
}

/** Exponentially decaying stereo noise: a small, soft room. */
function impulse(c: AudioContext, sec: number): AudioBuffer {
  const len = Math.floor(c.sampleRate * sec);
  const b = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  return b;
}

interface Tone {
  f: number;
  to?: number;
  at?: number;
  dur: number;
  gain: number;
  type?: OscillatorType;
  attack?: number;
  verb?: boolean;
}

function play(tones: Tone[]): void {
  const c = graph();
  if (!c || !dry || !wet) return;
  const t0 = c.currentTime + 0.005;
  for (const t of tones) {
    const start = t0 + (t.at ?? 0);
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = t.type ?? 'sine';
    o.frequency.setValueAtTime(t.f, start);
    if (t.to) o.frequency.exponentialRampToValueAtTime(t.to, start + t.dur * 0.8);
    const a = t.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(t.gain, start + a);
    g.gain.exponentialRampToValueAtTime(0.0001, start + t.dur);
    o.connect(g);
    g.connect(dry);
    if (t.verb !== false) g.connect(wet);
    o.start(start);
    o.stop(start + t.dur + 0.02);
  }
}

const N = (semi: number) => 440 * Math.pow(2, semi / 12);

export const sfx = {
  /** Generic button press: a short soft tick. */
  tap: () => play([{ f: 1250, to: 950, dur: 0.045, gain: 0.07, verb: false }]),
  select: () => play([{ f: 1600, to: 1500, dur: 0.035, gain: 0.05, type: 'triangle', verb: false }]),
  open: () => play([{ f: 330, to: 560, dur: 0.14, gain: 0.06, attack: 0.02 }]),
  close: () => play([{ f: 560, to: 330, dur: 0.12, gain: 0.05, attack: 0.015 }]),
  toggle: (on: boolean) => play([{ f: on ? 880 : 660, to: on ? 1175 : 495, dur: 0.07, gain: 0.06, type: 'triangle' }]),
  /** Stage up ("Thêm một chút"). */
  step: () => play([{ f: N(3), dur: 0.09, gain: 0.06, type: 'triangle' }, { f: N(10), at: 0.06, dur: 0.12, gain: 0.05, type: 'triangle' }]),
  correct: () =>
    play([
      { f: N(7), dur: 0.35, gain: 0.07, type: 'triangle' },
      { f: N(11), at: 0.06, dur: 0.35, gain: 0.065, type: 'triangle' },
      { f: N(14), at: 0.12, dur: 0.4, gain: 0.06, type: 'triangle' },
      { f: N(19), at: 0.18, dur: 0.55, gain: 0.05, type: 'sine' },
      { f: N(-5), dur: 0.4, gain: 0.05, type: 'sine' },
    ]),
  wrong: () =>
    play([
      { f: N(-2), to: N(-4), dur: 0.16, gain: 0.08, attack: 0.008 },
      { f: N(-7), to: N(-9), at: 0.09, dur: 0.24, gain: 0.08, attack: 0.008 },
    ]),
  /** Countdown second. */
  tick: () => play([{ f: 1480, dur: 0.06, gain: 0.07, verb: false }, { f: 740, dur: 0.05, gain: 0.03, verb: false }]),
  /** A sticker lands. */
  pop: () => play([{ f: 520, to: 880, dur: 0.09, gain: 0.05, type: 'triangle' }, { f: 1320, at: 0.05, dur: 0.06, gain: 0.03 }]),
  reveal: () => play([{ f: N(0), to: N(7), dur: 0.22, gain: 0.05, type: 'triangle', attack: 0.03 }]),
  win: () =>
    play([0, 4, 7, 12, 16].map((s, i) => ({ f: N(s + 3), at: i * 0.08, dur: 0.5 - i * 0.03, gain: 0.06, type: 'triangle' as const }))),
};

/** Browsers start audio contexts only after a gesture; warm ours on the first touch. */
export function initSfx(): void {
  const warm = () => {
    graph();
    window.removeEventListener('pointerdown', warm, true);
  };
  window.addEventListener('pointerdown', warm, true);
  // Delegated press sound for every button (opt out with data-sfx="none"; options use the select sound).
  document.addEventListener('click', (e) => {
    const el = (e.target as Element | null)?.closest?.('button, label.btn, [role="option"]');
    if (!el || (el as HTMLButtonElement).disabled || el.closest('[data-sfx="none"]')) return;
    if (el.getAttribute('role') === 'option' || el.getAttribute('role') === 'radio') sfx.select();
    else sfx.tap();
  }, true);
}
