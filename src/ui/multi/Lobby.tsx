import { useEffect, useState } from 'preact/hooks';
import { hasFile } from '../../audio/local';
import { REVEAL_CHOICES, clampOpts, clampSettings, type MatchMode, type MatchSettings, type RoomOpts } from '../../core/match';
import { COVER_CHOICES, GAME_KINDS, SOUND_CHOICES, kindInfo } from '../../core/modes';
import type { Playlist, PresetId } from '../../core/types';
import { saveLobbyDefaults, saveLobbyOpts } from '../../multi/identity';
import { RoomError, roomOpts, setRoomOpts, setRoomPlaylist, setRoomSettings, startMatch, subscribeFeatured } from '../../multi/room';
import type { FeaturedPlaylist, Room } from '../../multi/types';
import { ChoiceCards, ErrorBox, Segmented } from '../components';
import { useSettings } from '../hooks';
import { IconAuto, IconElim, IconFlag, IconHand, IconPlay, IconRounds } from '../icons';
import { KIND_ICONS } from '../screens/Setup';
import { usePlaylists } from '../screens/Home';
import { PlayerMenu, type Perms } from './parts';

const MODE_LABEL: Record<MatchMode, string> = { classic: 'Theo vòng', race: 'Đua điểm', elim: 'Loại dần' };
const MODE_ICON = { classic: <IconRounds size={26} />, race: <IconFlag size={26} />, elim: <IconElim size={26} /> };
const MODE_DESC: Record<MatchMode, string> = { classic: 'Chơi đủ số vòng', race: 'Ai chạm điểm đích trước', elim: 'Người thấp nhất bị loại' };

export const featuredToPlaylist = (f: FeaturedPlaylist): Playlist => ({
  id: f.id, name: f.name, kind: f.kind, songs: f.songs ?? [], defaultOffsetMs: f.defaultOffsetMs ?? 0, bestScore: 0, createdAt: f.publishedAt,
});

export function PlayerList({ code, room, perms }: { code: string; room: Room; perms: Perms }) {
  const players = Object.entries(room.players ?? {}).sort((a, b) => a[1].joinedAt - b[1].joinedAt);
  return (
    <ul class="players">
      {players.map(([id, p]) => (
        <li key={id} class={p.connected ? '' : 'offline'}>
          <span class="player-dot" aria-hidden="true" />
          <span class="player-name">{p.name}{id === perms.pid && <em class="tag">bạn</em>}</span>
          {id === room.meta.hostId && <em class="tag tag-accent">chủ phòng</em>}
          {room.meta.mods?.[id] && <em class="tag">điều hành</em>}
          {!p.connected && <em class="tag">mất kết nối</em>}
          <PlayerMenu code={code} room={room} target={id} perms={perms} />
        </li>
      ))}
    </ul>
  );
}

export function Lobby({ code, room, perms }: { code: string; room: Room; perms: Perms }) {
  const s = room.meta.settings;
  const settings = useSettings();
  const local = usePlaylists() ?? [];
  const [featured, setFeatured] = useState<FeaturedPlaylist[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [customRounds, setCustomRounds] = useState(![5, 10, 15, 20].includes(s.rounds));

  useEffect(() => (perms.isHost ? subscribeFeatured(setFeatured) : undefined), [perms.isHost]);

  const o = roomOpts(room);
  const changeOpts = (patch: Partial<RoomOpts>) => {
    const next = clampOpts({ ...o, ...patch });
    saveLobbyOpts(next);
    void setRoomOpts(code, next);
  };
  const change = (patch: Partial<MatchSettings>) => {
    const next = clampSettings({ ...s, ...patch });
    saveLobbyDefaults(next);
    void setRoomSettings(code, next);
  };

  const all: Playlist[] = [...local, ...featured.filter((f) => !local.some((l) => l.id === f.id)).map(featuredToPlaylist)];
  const pickPlaylist = async (id: string) => {
    const p = all.find((x) => x.id === id);
    if (!p) return;
    setBusy(true);
    setErr(null);
    try {
      await setRoomPlaylist(code, p);
    } catch {
      setErr('Không gửi được danh sách lên phòng.');
    } finally {
      setBusy(false);
    }
  };
  const start = async () => {
    setErr(null);
    try {
      await startMatch(code, room);
    } catch (e) {
      setErr(e instanceof RoomError ? e.message : 'Không bắt đầu được.');
    }
  };

  const chosen = local.find((l) => l.id === room.playlist?.id);
  const missingFiles = room.playlist?.kind === 'local' && (!chosen || chosen.songs.filter(hasFile).length === 0);
  const count = Object.keys(room.players ?? {}).length;

  return (
    <div class="stack">
      <section class="stack-sm">
        <h2 class="section-title">Người chơi <span class="muted num">{count}/12</span></h2>
        <PlayerList code={code} room={room} perms={perms} />
      </section>

      <section class="card stack-sm">
        <h2 class="section-title">Danh sách bài hát</h2>
        {perms.isHost ? (
          <select class="input" value={room.playlist?.id ?? ''} disabled={busy} aria-label="Danh sách bài hát" onChange={(e) => pickPlaylist(e.currentTarget.value)}>
            <option value="" disabled>Chọn danh sách...</option>
            {local.length > 0 && <optgroup label="Của bạn">{local.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.songs.length})</option>)}</optgroup>}
            {featured.length > 0 && <optgroup label="Playlist đề xuất">{featured.filter((f) => !local.some((l) => l.id === f.id)).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.songs?.length ?? 0})</option>)}</optgroup>}
          </select>
        ) : (
          <p>{room.playlist ? <><b>{room.playlist.name}</b> <span class="muted num">· {room.playlist.songs.length} bài</span></> : <span class="muted">Chủ phòng chưa chọn danh sách.</span>}</p>
        )}
        {busy && <p class="hint">Đang gửi danh sách...</p>}
        {perms.isHost && missingFiles && <p class="error-text">Chọn lại tệp nhạc của danh sách này ở màn hình danh sách trước khi chơi.</p>}
      </section>

      <section class="card stack-sm">
        <h2 class="section-title">Luật chơi</h2>
        {perms.isHost ? (
          <>
            <span class="field-label">Chế độ chơi</span>
            <ChoiceCards label="Chế độ chơi" value={o.kind} onChange={(kind) => changeOpts({ kind, choices: kind === 'sound' ? 6 : 20 })}
              options={GAME_KINDS.map((k) => ({
                value: k.id, title: k.name, desc: k.desc, icon: KIND_ICONS[k.id],
                disabled: k.id === 'sound' && room.playlist?.kind === 'local',
                note: k.id === 'sound' && room.playlist?.kind === 'local' ? 'Chỉ dùng với playlist YouTube' : undefined,
              }))} />
            {o.kind === 'cover' && (
              <>
                <span class="field-label">Số ảnh để chọn</span>
                <Segmented label="Số ảnh để chọn" value={o.choices} onChange={(choices) => changeOpts({ choices })}
                  options={COVER_CHOICES.map((n) => ({ value: n, label: String(n) }))} />
              </>
            )}
            {o.kind === 'sound' && (
              <>
                <span class="field-label">Số đoạn để chọn</span>
                <Segmented label="Số đoạn để chọn" value={o.choices} onChange={(choices) => changeOpts({ choices })}
                  options={SOUND_CHOICES.map((n) => ({ value: n, label: String(n) }))} />
              </>
            )}
            <span class="field-label">Thể thức</span>
            <ChoiceCards label="Thể thức" cols={3} value={s.mode} onChange={(mode) => change({ mode })}
              options={(['classic', 'race', 'elim'] as const).map((m) => ({ value: m, title: MODE_LABEL[m], desc: MODE_DESC[m], icon: MODE_ICON[m] }))} />
            <span class="field-label">Điều khiển</span>
            <ChoiceCards label="Điều khiển" value={o.flow} onChange={(flow) => changeOpts({ flow })}
              options={[
                { value: 'auto', title: 'Tự động', desc: 'Tự bắt đầu và tự sang bài', icon: <IconAuto size={26} /> },
                { value: 'manual', title: 'Chủ phòng bấm', desc: 'Bạn bấm Bắt đầu và Bài tiếp', icon: <IconHand size={26} /> },
              ]} />
            {o.flow === 'auto' && (
              <>
                <span class="field-label">Xem đáp án trong</span>
                <Segmented label="Xem đáp án trong" value={o.revealSec} onChange={(revealSec) => changeOpts({ revealSec })}
                  options={REVEAL_CHOICES.map((n) => ({ value: n, label: `${n} giây` }))} />
              </>
            )}
            <span class="field-label">Số vòng{room.playlist && s.rounds > room.playlist.songs.length && <span class="muted num"> (danh sách chỉ có {room.playlist.songs.length} bài)</span>}</span>
            <Segmented label="Số vòng" value={customRounds ? 0 : s.rounds}
              onChange={(v) => (v === 0 ? setCustomRounds(true) : (setCustomRounds(false), change({ rounds: v })))}
              options={[5, 10, 15, 20].map((n) => ({ value: n, label: String(n) })).concat([{ value: 0, label: 'Khác' }])} />
            {customRounds && (
              <input class="input num" type="number" min={1} max={50} value={s.rounds} aria-label="Số vòng (tối đa 50)"
                onChange={(e) => change({ rounds: Number(e.currentTarget.value) })} />
            )}
            {s.mode === 'race' && (
              <label class="field">Điểm đích (500-20000)
                <input class="input num" type="number" min={500} max={20000} step={500} value={s.target} onChange={(e) => change({ target: Number(e.currentTarget.value) })} />
              </label>
            )}
            {s.mode === 'elim' && (
              <label class="field">Loại người thấp điểm nhất sau mỗi (vòng)
                <input class="input num" type="number" min={1} max={10} value={s.elimEvery} onChange={(e) => change({ elimEvery: Number(e.currentTarget.value) })} />
              </label>
            )}
            {o.kind !== 'sound' && <span class="field-label">Độ khó</span>}
            {o.kind !== 'sound' && <Segmented label="Độ khó" value={s.presetId} onChange={(presetId: PresetId) => change({ presetId })}
              options={(['tichtac', 'thuong'] as const).map((id) => ({ value: id, label: settings.presets[id].name }))} />}
            <label class="field">Thời gian đoán sau mỗi đoạn (giây)
              <input class="input num" type="number" min={3} max={20} value={s.intervalSec} onChange={(e) => change({ intervalSec: Number(e.currentTarget.value) })} />
            </label>
            <span class="field-label">Chờ sau khi đoán sai</span>
            <Segmented label="Chờ sau khi đoán sai" value={s.cooldownSec} onChange={(cooldownSec) => change({ cooldownSec })}
              options={([0, 2, 5] as const).map((n) => ({ value: n, label: `${n} giây` }))} />
            <label class="switch-row">
              <span class="grow">Thưởng tốc độ (tối đa +200)</span>
              <input type="checkbox" class="switch" checked={s.speedBonus} onChange={(e) => change({ speedBonus: e.currentTarget.checked })} />
            </label>
          </>
        ) : (
          <p class="num">
            {kindInfo(o.kind).name} · {MODE_LABEL[s.mode]} · {s.rounds} vòng{s.mode === 'race' && ` · đích ${s.target.toLocaleString('vi-VN')}`}
            {s.mode === 'elim' && ` · loại sau mỗi ${s.elimEvery} vòng`} · {settings.presets[s.presetId].name} · đoán {s.intervalSec} giây/đoạn
            · chờ {s.cooldownSec} giây{s.speedBonus && ' · thưởng tốc độ'} · {o.flow === 'manual' ? 'chủ phòng điều khiển' : 'tự động'}
          </p>
        )}
      </section>

      {err && <ErrorBox>{err}</ErrorBox>}
      {perms.isHost ? (
        <button class="btn btn-primary btn-xl btn-block" disabled={!room.playlist || missingFiles || busy} onClick={start}><IconPlay /> Bắt đầu</button>
      ) : (
        <p class="status">Chờ chủ phòng bắt đầu...</p>
      )}
    </div>
  );
}
