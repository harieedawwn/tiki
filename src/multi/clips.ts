const RATE = 22050;

/** Cuts `durSec` from `startSec` of a buffer into 16-bit mono 22.05 kHz WAV, base64-encoded. */
export async function cutClipWav(buf: AudioBuffer, startSec: number, durSec: number): Promise<string> {
  const len = Math.max(1, Math.ceil(durSec * RATE));
  const ctx = new OfflineAudioContext(1, len, RATE);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination); // multi-channel input is down-mixed to mono by the 1-channel destination
  src.start(0, startSec, durSec);
  const out = (await ctx.startRendering()).getChannelData(0);
  return toBase64(encodeWav(out, RATE));
}

function encodeWav(samples: Float32Array, rate: number): Uint8Array {
  const b = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(b);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true);
  return new Uint8Array(b);
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(b64: string): ArrayBuffer {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out.buffer;
}

/** Re-encodes a cover data URL so its base64 payload is at most `maxBytes` characters; '' if impossible. */
export async function shrinkCover(dataUrl: string, maxBytes = 8192): Promise<string> {
  if (!dataUrl.startsWith('data:')) return dataUrl;
  try {
    const img = await createImageBitmap(await (await fetch(dataUrl)).blob());
    for (const [size, q] of [[96, 0.7], [72, 0.6], [56, 0.5]] as const) {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      c.getContext('2d')!.drawImage(img, 0, 0, size, size);
      const url = c.toDataURL('image/jpeg', q);
      if (url.length - url.indexOf(',') - 1 <= maxBytes) return url;
    }
  } catch {
    /* fall through */
  }
  return '';
}
