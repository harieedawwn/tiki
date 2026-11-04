import { useEffect, useRef, useState } from 'preact/hooks';
import { engineFor } from '../../audio';
import { hasFile, localEngine } from '../../audio/local';
import { peaks } from '../../audio/silence';
import { PRESET_ORDER, formatSeconds } from '../../core/stages';
import type { Playlist, Song } from '../../core/types';
import { savePlaylist } from '../../data/db';
import { useSettings } from '../hooks';
import { IconPlay, IconX } from '../icons';

const SPAN_MS = 15000;

/** Local files: waveform of the first 15 s with the detected start and a draggable start marker. */
function LocalWave({ song, startMs, onChange }: { song: Song; startMs: number | null; onChange: (ms: number) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [data, setData] = useState<{ peaks: number[]; detected: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    localEngine.decode(song).then((buf) => {
      setData({ peaks: peaks(buf.getChannelData(0), buf.sampleRate, SPAN_MS, 300), detected: localEngine.detect(buf) });
    }).catch(() => setErr('Chọn lại tệp của bài này để xem dạng sóng.'));
  }, [song.id]);

  const effective = startMs ?? data?.detected ?? 0;
  useEffect(() => {
    const c = canvas.current;
    if (!c || !data) return;
    const css = getComputedStyle(c);
    const W = (c.width = c.clientWidth * devicePixelRatio), H = (c.height = c.clientHeight * devicePixelRatio);
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = css.getPropertyValue('--ink');
    const bw = W / data.peaks.length;
    data.peaks.forEach((p, i) => {
      const h = Math.max(1, p * H * 0.9);
      ctx.fillRect(i * bw, (H - h) / 2, Math.max(1, bw - 1), h);
    });
    const mark = (ms: number, color: string, w: number) => {
      ctx.fillStyle = color;
      ctx.fillRect((ms / SPAN_MS) * W - w / 2, 0, w, H);
    };
    mark(data.detected, css.getPropertyValue('--second'), 2 * devicePixelRatio);
    mark(effective, css.getPropertyValue('--accent'), 3 * devicePixelRatio);
  }, [data, effective]);

  const drag = (e: PointerEvent) => {
    if (e.type === 'pointerdown') (e.currentTarget as Element).setPointerCapture(e.pointerId);
    else if (!(e.buttons & 1)) return;
    const r = (e.currentTarget as Element).getBoundingClientRect();
    onChange(Math.round(Math.min(Math.max(0, (e.clientX - r.left) / r.width), 1) * SPAN_MS));
  };

  if (err) return <p class="hint">{err}</p>;
  return (
    <div class="stack-xs">
      <canvas ref={canvas} class="wave-canvas" onPointerDown={drag} onPointerMove={drag} aria-label="Dạng sóng 15 giây đầu" />
      <p class="hint num">Vạch xanh: điểm bắt đầu tự dò ({data ? Math.round(data.detected) : '-'} ms). Vạch đỏ: điểm bắt đầu đang dùng. Kéo để chỉnh.</p>
    </div>
  );
}

export function SongEditor({ playlist, song, onClose }: { playlist: Playlist; song: Song; onClose: () => void }) {
  const settings = useSettings();
  const [title, setTitle] = useState(song.title);
  const [artist, setArtist] = useState(song.artist);
  const [offset, setOffset] = useState<number | null>(song.startOffsetMs);
  const [status, setStatus] = useState<string | null>(null);
  const prepared = useRef<string>('');

  const draft = (): Song => ({ ...song, title: title.trim() || song.title, artist: artist.trim(), startOffsetMs: offset });

  const save = async () => {
    const songs = playlist.songs.map((s) => (s.id === song.id ? draft() : s));
    await savePlaylist({ ...playlist, songs });
    onClose();
  };

  const tryStage = async (sec: number) => {
    const d = draft();
    const eng = engineFor(d);
    const key = d.id + ':' + offset;
    try {
      if (prepared.current !== key) {
        setStatus('Đang chuẩn bị...');
        if (d.source.type === 'local') localEngine.context();
        await eng.prepare(d, playlist);
        prepared.current = key;
      }
      setStatus(`Đang phát ${formatSeconds(sec)}`);
      await eng.playClip(Math.round(sec * 1000));
      setStatus(null);
    } catch (e) {
      prepared.current = '';
      setStatus('Không phát được: ' + (e instanceof Error ? e.message : ''));
    }
  };

  const allStages = [...new Set(PRESET_ORDER.flatMap((id) => settings.presets[id].stages))].sort((a, b) => a - b);
  const isLocal = song.source.type === 'local';

  return (
    <div class="scrim">
      <div class="sheet sheet-auto editor" role="dialog" aria-label="Sửa bài hát">
        <div class="row">
          <h2 class="sheet-title grow">Sửa bài hát</h2>
          <button class="icon-btn" aria-label="Đóng" onClick={onClose}><IconX /></button>
        </div>
        <label class="field">Tên bài<input class="input" value={title} onInput={(e) => setTitle(e.currentTarget.value)} /></label>
        <label class="field">Ca sĩ<input class="input" value={artist} onInput={(e) => setArtist(e.currentTarget.value)} /></label>
        <div class="field">
          <span>Điểm bắt đầu {offset === null && <em class="muted">(tự động{isLocal && song.detectedStartMs !== undefined ? `: ${Math.round(song.detectedStartMs)} ms` : `: ${playlist.defaultOffsetMs} ms`})</em>}</span>
          <div class="row">
            <input class="grow" type="range" min={0} max={30000} step={10} value={offset ?? 0} aria-label="Điểm bắt đầu"
              onInput={(e) => setOffset(Number(e.currentTarget.value))} />
            <input class="input input-num num" type="number" min={0} max={600000} step={1} value={offset ?? ''} placeholder="tự động"
              aria-label="Điểm bắt đầu (ms)" onInput={(e) => setOffset(e.currentTarget.value === '' ? null : Math.max(0, Number(e.currentTarget.value)))} />
            <span class="muted">ms</span>
          </div>
          <button class="link-btn" onClick={() => setOffset(null)}>Dùng tự động</button>
        </div>
        {isLocal && (hasFile(song) ? <LocalWave song={song} startMs={offset} onChange={setOffset} /> : <p class="hint">Chọn lại tệp của danh sách này để xem dạng sóng.</p>)}
        <div class="field">
          <span>Nghe thử</span>
          <div class="chips">
            {allStages.map((s) => (
              <button key={s} class="chip num" onClick={() => tryStage(s)}><IconPlay size={14} />{formatSeconds(s)}</button>
            ))}
          </div>
          {status && <p class="hint">{status}</p>}
        </div>
        <button class="btn btn-primary btn-block" onClick={save}>Lưu</button>
      </div>
    </div>
  );
}
