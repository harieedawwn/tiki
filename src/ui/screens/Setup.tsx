import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { hasFile, localEngine } from '../../audio/local';
import { COVER_CHOICES, GAME_KINDS, SOUND_CHOICES } from '../../core/modes';
import { PRESET_ORDER, formatSeconds } from '../../core/stages';
import type { GameKind, Playlist, PresetId } from '../../core/types';
import { getPlaylist } from '../../data/db';
import { relinkFiles } from '../../data/localImport';
import { updateSettings } from '../../data/settings';
import type { Route } from '../App';
import { ChoiceCards, Cover, Segmented, StageEditor } from '../components';
import { useSettings } from '../hooks';
import { IconBack, IconClassic, IconCoverPick, IconFolder, IconMusic, IconPlay, IconRandom, IconSoundPick } from '../icons';
import { enterFullscreenOnce } from '../pwa';

export const KIND_ICONS: Record<GameKind, ComponentChildren> = {
  classic: <IconClassic size={28} />, random: <IconRandom size={28} />, cover: <IconCoverPick size={28} />, sound: <IconSoundPick size={28} />,
};

export function Setup({ playlistId, go }: { playlistId: string; go: (r: Route) => void }) {
  const settings = useSettings();
  const last = settings.lastGame;
  const [p, setP] = useState<Playlist | null>(null);
  const [count, setCount] = useState<number | 'all'>(last.count);
  const [preset, setPreset] = useState<PresetId>(last.preset);
  const [kind, setKind] = useState<GameKind>(last.kind);
  const [coverChoices, setCoverChoices] = useState(last.coverChoices);
  const [soundChoices, setSoundChoices] = useState(last.soundChoices);
  const [customOk, setCustomOk] = useState(true);
  const [, force] = useState(0);

  useEffect(() => void getPlaylist(playlistId).then((x) => setP(x ?? null)), [playlistId]);
  if (!p) return <p class="muted">Đang tải...</p>;

  const ready = p.kind === 'local' ? p.songs.filter(hasFile) : p.songs;
  const withCover = ready.filter((s) => s.cover).length;
  const playable = kind === 'cover' ? withCover : ready.length;
  const kindOk = (k: GameKind) => (k === 'cover' ? withCover >= 4 : k === 'sound' ? ready.length >= 2 : ready.length > 0);
  const onRelink = (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    relinkFiles([...(input.files ?? [])], p);
    input.value = '';
    force((n) => n + 1);
  };
  const choices = kind === 'cover' ? Math.min(coverChoices, withCover) : kind === 'sound' ? Math.min(soundChoices, ready.length) : 0;
  const start = () => {
    enterFullscreenOnce();
    if (p.kind === 'local') localEngine.context();
    updateSettings({ lastGame: { kind, count, preset, coverChoices, soundChoices } });
    go({ name: 'game', playlistId: p.id, count, presetId: preset, kind, choices });
  };
  const mosaic = p.songs.filter((s) => s.cover).slice(0, 4);

  return (
    <div class="stack">
      <button class="link-btn" onClick={() => go({ name: 'home' })}><IconBack size={18} /> Danh sách</button>
      <div class="setup-head">
        <div class="mosaic" aria-hidden="true">{mosaic.map((s) => <Cover key={s.id} song={s} />)}</div>
        <div class="grow">
          <p class="kicker">{p.kind === 'youtube' ? 'YouTube' : 'Nhạc trên máy'}</p>
          <h1 class="title-lg">{p.name}</h1>
          <p class="muted num">{p.songs.length} bài{p.bestScore > 0 && ` · Kỷ lục ${p.bestScore.toLocaleString('vi-VN')}`}</p>
        </div>
      </div>

      {p.kind === 'local' && ready.length < p.songs.length && (
        <div class="card stack-sm">
          <p><strong>Chọn lại tệp nhạc</strong> để chơi trong phiên này ({ready.length}/{p.songs.length} bài đã sẵn sàng). Trình duyệt không giữ quyền đọc tệp giữa các lần mở.</p>
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

      <section class="stack-sm">
        <h2 class="section-title">Chế độ</h2>
        <ChoiceCards label="Chế độ" value={kind} onChange={setKind}
          options={GAME_KINDS.map((k) => ({
            value: k.id, title: k.name, desc: k.desc, icon: KIND_ICONS[k.id], disabled: !kindOk(k.id),
            note: !kindOk(k.id) ? (k.id === 'cover' ? 'Cần ít nhất 4 bài có ảnh bìa' : 'Chưa đủ bài') : undefined,
          }))} />
      </section>

      <section class="stack-sm">
        <h2 class="section-title">Số bài</h2>
        <Segmented label="Số bài" value={count} onChange={setCount}
          options={[{ value: 10, label: '10' }, { value: 20, label: '20' }, { value: 'all', label: `Tất cả (${playable})` }]} />
      </section>

      {kind === 'sound' ? (
        <section class="stack-sm">
          <h2 class="section-title">Số đoạn để chọn</h2>
          <Segmented label="Số đoạn để chọn" value={soundChoices} onChange={setSoundChoices}
            options={SOUND_CHOICES.map((n) => ({ value: n, label: String(n), disabled: n > ready.length && n !== SOUND_CHOICES[0] }))} />
          <p class="hint">Mỗi vòng có 3 lần chọn: 1000, 500 rồi 250 điểm.</p>
        </section>
      ) : (
        <section class="stack-sm">
          <h2 class="section-title">Độ khó</h2>
          <Segmented label="Độ khó" value={preset} onChange={setPreset}
            options={PRESET_ORDER.map((id) => ({ value: id, label: settings.presets[id].name }))} />
          {preset === 'custom' ? (
            <StageEditor initial={settings.presets.custom.stages} onChange={(st) => {
              setCustomOk(!!st);
              if (st) updateSettings({ presets: { ...settings.presets, custom: { ...settings.presets.custom, stages: st } } });
            }} />
          ) : (
            <div class="stage-chips num" aria-label="Các đoạn">
              {settings.presets[preset].stages.map((st, i) => <span key={preset + i} style={{ animationDelay: i * 40 + 'ms' }}>{formatSeconds(st)}</span>)}
            </div>
          )}
        </section>
      )}

      {kind === 'cover' && (
        <section class="stack-sm">
          <h2 class="section-title">Số ảnh để chọn</h2>
          <Segmented label="Số ảnh để chọn" value={coverChoices} onChange={setCoverChoices}
            options={COVER_CHOICES.map((n) => ({ value: n, label: String(n), disabled: n > withCover && n !== COVER_CHOICES[0] }))} />
        </section>
      )}

      <button class="btn btn-primary btn-xl btn-block cta" disabled={playable === 0 || !kindOk(kind) || (kind !== 'sound' && preset === 'custom' && !customOk)} onClick={start}>
        <IconPlay /> Chơi
      </button>
    </div>
  );
}
