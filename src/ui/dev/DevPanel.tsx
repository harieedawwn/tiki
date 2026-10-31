import { useMemo, useState } from 'preact/hooks';
import { DEFAULT_PRESETS, formatSeconds, validStages } from '../../core/stages';
import { buildIndex, search } from '../../core/text';
import type { Playlist, PresetId, Song } from '../../core/types';
import { resetAllData, savePlaylist } from '../../data/db';
import { resetSettingsInMemory, updateSettings } from '../../data/settings';
import type { Route } from '../App';
import { Cover, ErrorBox, Segmented } from '../components';
import { useSettings } from '../hooks';
import { IconDownload, IconSearch, IconUpload } from '../icons';
import { usePlaylists } from '../screens/Home';
import { RoomModerationSlot } from './roomModeration';
import { SongEditor } from './SongEditor';

type Tab = 'songs' | 'playlist' | 'config' | 'data' | 'room';

export function DevPanel({ go }: { go: (r: Route) => void }) {
  const playlists = usePlaylists();
  const [tab, setTab] = useState<Tab>('songs');
  const [pid, setPid] = useState<string>('');
  const p = playlists?.find((x) => x.id === pid) ?? playlists?.[0];

  return (
    <div class="stack">
      <h1 class="display display-sm">Nhà phát triển</h1>
      <div class="tabs" role="tablist">
        {([['songs', 'Bài hát'], ['playlist', 'Danh sách'], ['config', 'Cấu hình'], ['data', 'Dữ liệu'], ['room', 'Phòng']] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} class={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {(tab === 'songs' || tab === 'playlist') && playlists && playlists.length > 0 && (
        <select class="input" value={p?.id} onChange={(e) => setPid(e.currentTarget.value)} aria-label="Danh sách">
          {playlists.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      )}
      {(tab === 'songs' || tab === 'playlist') && !p && <p class="muted">Chưa có danh sách nào.</p>}
      {tab === 'songs' && p && <SongsTab playlist={p} />}
      {tab === 'playlist' && p && <PlaylistTab playlist={p} />}
      {tab === 'playlist' && <ImportJson />}
      {tab === 'config' && <ConfigTab />}
      {tab === 'data' && <DataTab go={go} />}
      {tab === 'room' && <RoomModerationSlot />}
    </div>
  );
}

function SongsTab({ playlist }: { playlist: Playlist }) {
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Song | null>(null);
  const index = useMemo(() => buildIndex(playlist.songs), [playlist]);
  const list = search(index, q);
  return (
    <div class="stack-sm">
      <label class="search search-boxed">
        <IconSearch size={20} />
        <input type="search" placeholder="Tìm bài" value={q} onInput={(e) => setQ(e.currentTarget.value)} />
      </label>
      <ul class="dev-songs">
        {list.map((s) => (
          <li key={s.id}>
            <button class="dev-song" onClick={() => setEdit(s)}>
              <Cover song={s} size={44} />
              <span class="track-main">
                <span class="track-name">{s.title}</span>
                <span class="track-meta">{s.artist}</span>
              </span>
              <span class="num muted">{s.startOffsetMs === null ? 'tự động' : `${s.startOffsetMs} ms`}</span>
            </button>
          </li>
        ))}
      </ul>
      {edit && <SongEditor playlist={playlist} song={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function download(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function PlaylistTab({ playlist }: { playlist: Playlist }) {
  const [offset, setOffset] = useState(String(playlist.defaultOffsetMs));
  const [saved, setSaved] = useState(false);
  const save = async () => {
    await savePlaylist({ ...playlist, defaultOffsetMs: Math.max(0, Math.round(Number(offset) || 0)) });
    setSaved(true);
  };
  const exportJson = () => {
    const safe = playlist.name.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 40);
    download(`tiki-${safe}.json`, JSON.stringify({ format: 'tiki-playlist', version: 1, playlist }, null, 1));
  };
  return (
    <section class="card stack-sm">
      <h2 class="section-title">Điểm bắt đầu mặc định</h2>
      <p class="hint">
        {playlist.kind === 'youtube'
          ? 'Áp dụng cho mọi bài chưa đặt điểm bắt đầu riêng.'
          : 'Cộng thêm vào điểm bắt đầu tự dò cho mọi bài chưa đặt riêng.'}
      </p>
      <div class="row">
        <input class="input input-num num grow" type="number" min={0} value={offset} aria-label="Điểm bắt đầu mặc định (ms)"
          onInput={(e) => (setOffset(e.currentTarget.value), setSaved(false))} />
        <span class="muted">ms</span>
        <button class="btn" onClick={save}>{saved ? 'Đã lưu' : 'Lưu'}</button>
      </div>
      <button class="btn btn-block" onClick={exportJson}><IconDownload size={18} /> Xuất JSON (kèm điểm bắt đầu)</button>
    </section>
  );
}

function ImportJson() {
  const [msg, setMsg] = useState<string | null>(null);
  const onFile = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const p = data?.playlist as Playlist;
      if (!['tiki-playlist', 'tiktak-playlist'].includes(data?.format) || !p?.id || !Array.isArray(p.songs)) throw new Error();
      await savePlaylist({ ...p, bestScore: p.bestScore ?? 0, createdAt: Date.now() });
      setMsg(`Đã nhập "${p.name}" (${p.songs.length} bài).`);
    } catch {
      setMsg('Tệp JSON không hợp lệ.');
    }
  };
  return (
    <section class="card stack-sm">
      <h2 class="section-title">Nhập danh sách từ JSON</h2>
      <label class="btn btn-block"><IconUpload size={18} /> Chọn tệp JSON
        <input type="file" accept="application/json,.json" hidden onChange={onFile} />
      </label>
      {msg && <p class="hint">{msg}</p>}
    </section>
  );
}

function ConfigTab() {
  const s = useSettings();
  const [which, setWhich] = useState<PresetId>('tichtac');
  const [vals, setVals] = useState(() => s.presets[which].stages.map(String));
  const [err, setErr] = useState<string | null>(null);
  const pick = (id: PresetId) => {
    setWhich(id);
    setVals(s.presets[id].stages.map(String));
    setErr(null);
  };
  const savePreset = () => {
    const stages = vals.map((v) => Number(v.replace(',', '.')));
    if (!validStages(stages)) return setErr('Cần 6 số dương, tăng dần, tối đa 30 giây.');
    setErr(null);
    updateSettings({ presets: { ...s.presets, [which]: { ...s.presets[which], stages } } });
  };
  return (
    <div class="stack">
      <section class="card stack-sm">
        <h2 class="section-title">Độ khó (giây)</h2>
        <Segmented label="Độ khó" value={which} onChange={pick}
          options={(['tichtac', 'thuong'] as const).map((id) => ({ value: id, label: s.presets[id].name }))} />
        <div class="preset-grid">
          {vals.map((v, i) => (
            <input key={i} class="input input-num num" inputMode="decimal" value={v} aria-label={`Đoạn ${i + 1}`}
              onInput={(e) => setVals(vals.map((x, j) => (j === i ? e.currentTarget.value : x)))} />
          ))}
        </div>
        <p class="hint num">Đang dùng: {s.presets[which].stages.map(formatSeconds).join(' / ')}</p>
        {err && <p class="error-text">{err}</p>}
        <div class="row">
          <button class="btn grow" onClick={() => { updateSettings({ presets: { ...s.presets, [which]: DEFAULT_PRESETS[which] } }); setVals(DEFAULT_PRESETS[which].stages.map(String)); }}>Mặc định</button>
          <button class="btn btn-primary grow" onClick={savePreset}>Lưu</button>
        </div>
      </section>

      <section class="card stack-sm">
        <h2 class="section-title">Cắt khoảng lặng (tệp trên máy)</h2>
        <label class="field">
          <span class="num">Ngưỡng: {s.silenceThresholdDb} dBFS</span>
          <input type="range" min={-70} max={-20} step={1} value={s.silenceThresholdDb}
            onInput={(e) => updateSettings({ silenceThresholdDb: Number(e.currentTarget.value) })} />
        </label>
        <label class="field">
          <span class="num">Giữ lại trước điểm bắt đầu: {s.prerollMs} ms</span>
          <input type="range" min={0} max={200} step={5} value={s.prerollMs}
            onInput={(e) => updateSettings({ prerollMs: Number(e.currentTarget.value) })} />
        </label>
      </section>

      <section class="card">
        <label class="toggle">
          <input type="checkbox" checked={s.debugOverlay} onChange={(e) => updateSettings({ debugOverlay: e.currentTarget.checked })} />
          <span>Hiện lớp gỡ lỗi (thời lượng yêu cầu và đo được)</span>
        </label>
      </section>
    </div>
  );
}

function DataTab({ go }: { go: (r: Route) => void }) {
  const [err, setErr] = useState<string | null>(null);
  const reset = async () => {
    if (!confirm('Xoá toàn bộ danh sách, điểm và cài đặt trên máy này?')) return;
    try {
      await resetAllData();
      resetSettingsInMemory();
      go({ name: 'home' });
    } catch {
      setErr('Không xoá được dữ liệu.');
    }
  };
  return (
    <section class="card stack-sm">
      <h2 class="section-title">Dữ liệu</h2>
      <p class="hint">Xoá mọi danh sách đã lưu, kỷ lục và cài đặt (kể cả trạng thái mở khoá) trên trình duyệt này.</p>
      <button class="btn btn-danger btn-block" onClick={reset}>Xoá toàn bộ dữ liệu</button>
      {err && <ErrorBox>{err}</ErrorBox>}
    </section>
  );
}
