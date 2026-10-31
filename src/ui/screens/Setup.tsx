import { useEffect, useState } from 'preact/hooks';
import { hasFile, localEngine } from '../../audio/local';
import { formatSeconds } from '../../core/stages';
import type { Playlist, PresetId } from '../../core/types';
import { getPlaylist } from '../../data/db';
import { relinkFiles } from '../../data/localImport';
import type { Route } from '../App';
import { Segmented } from '../components';
import { useSettings } from '../hooks';
import { IconBack, IconFolder, IconMusic, IconPlay } from '../icons';
import { enterFullscreenOnce } from '../pwa';

export function Setup({ playlistId, go }: { playlistId: string; go: (r: Route) => void }) {
  const settings = useSettings();
  const [p, setP] = useState<Playlist | null>(null);
  const [count, setCount] = useState<number | 'all'>(10);
  const [preset, setPreset] = useState<PresetId>('tichtac');
  const [, force] = useState(0);

  useEffect(() => void getPlaylist(playlistId).then((x) => setP(x ?? null)), [playlistId]);
  if (!p) return <p class="muted">Đang tải...</p>;

  const playable = p.kind === 'local' ? p.songs.filter(hasFile).length : p.songs.length;
  const onRelink = (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    relinkFiles([...(input.files ?? [])], p);
    input.value = '';
    force((n) => n + 1);
  };
  const start = () => {
    enterFullscreenOnce();
    if (p.kind === 'local') localEngine.context();
    go({ name: 'game', playlistId: p.id, count, presetId: preset });
  };

  return (
    <div class="stack">
      <button class="link-btn" onClick={() => go({ name: 'home' })}><IconBack size={18} /> Danh sách</button>
      <div>
        <p class="kicker">{p.kind === 'youtube' ? 'YouTube' : 'Nhạc trên máy'}</p>
        <h1 class="display display-sm">{p.name}</h1>
        <p class="muted num">{p.songs.length} bài{p.bestScore > 0 && ` · Kỷ lục ${p.bestScore.toLocaleString('vi-VN')} điểm`}</p>
      </div>

      {p.kind === 'local' && playable < p.songs.length && (
        <div class="card stack-sm">
          <p><strong>Chọn lại tệp nhạc</strong> để chơi trong phiên này ({playable}/{p.songs.length} bài đã sẵn sàng). Trình duyệt không giữ quyền đọc tệp giữa các lần mở.</p>
          <div class="row wrap">
            <label class="btn grow"><IconMusic size={18} /> Chọn tệp
              <input type="file" accept="audio/*" multiple hidden onChange={onRelink} />
            </label>
            <label class="btn grow"><IconFolder size={18} /> Chọn thư mục
              <input type="file" multiple hidden onChange={onRelink} {...{ webkitdirectory: '' }} />
            </label>
          </div>
        </div>
      )}

      <div class="stack-sm">
        <h2 class="section-title">Số bài</h2>
        <Segmented label="Số bài" value={count} onChange={setCount}
          options={[{ value: 10, label: '10' }, { value: 20, label: '20' }, { value: 'all', label: `Tất cả (${playable})` }]} />
      </div>

      <div class="stack-sm">
        <h2 class="section-title">Độ khó</h2>
        <Segmented label="Độ khó" value={preset} onChange={setPreset}
          options={(['tichtac', 'thuong'] as const).map((id) => ({ value: id, label: settings.presets[id].name }))} />
        <p class="hint num">{settings.presets[preset].stages.map(formatSeconds).join('  /  ')}</p>
      </div>

      <button class="btn btn-primary btn-xl btn-block" disabled={playable === 0} onClick={start}>
        <IconPlay /> Chơi
      </button>
    </div>
  );
}
