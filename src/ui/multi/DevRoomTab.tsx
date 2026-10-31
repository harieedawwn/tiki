import { useEffect, useState } from 'preact/hooks';
import { normalizeRoomCode, ROOM_CODE_RE } from '../../core/match';
import { lastRoom, playerId } from '../../multi/identity';
import { deleteRoom, publishFeatured, subscribeFeatured, subscribeRoom, unpublishFeatured } from '../../multi/room';
import type { FeaturedPlaylist, Room } from '../../multi/types';
import { usePlaylists } from '../screens/Home';
import { PlayerList } from './Lobby';

/** Dev panel "Phòng" tab: moderate any room by code, and publish playlists to /featured. */
export function DevRoomTab() {
  const [code, setCode] = useState(lastRoom());
  const [room, setRoom] = useState<Room | null | undefined>(undefined);
  const valid = ROOM_CODE_RE.test(code);

  useEffect(() => (valid ? subscribeRoom(code, setRoom) : (setRoom(undefined), undefined)), [code, valid]);

  return (
    <div class="stack">
      <section class="card stack-sm">
        <h2 class="section-title">Kiểm duyệt phòng</h2>
        <input class="input num" placeholder="Mã phòng" value={code} maxLength={5} aria-label="Mã phòng"
          onInput={(e) => setCode(normalizeRoomCode(e.currentTarget.value))} />
        {valid && room === null && <p class="hint">Không tìm thấy phòng.</p>}
        {room?.meta && (
          <>
            <p class="hint num">Trạng thái: {room.meta.status} · {Object.keys(room.players ?? {}).length} người · {room.meta.locked ? 'đã khoá' : 'mở'}</p>
            <PlayerList code={code} room={room} perms={{ pid: playerId(), isHost: false, isMod: true, isDev: true }} />
            <p class="hint">Muốn làm chủ phòng: vào phòng rồi bấm "Làm chủ phòng" trên thanh điều hành.</p>
            <button class="btn btn-danger btn-block" onClick={() => confirm(`Xoá phòng ${code}?`) && deleteRoom(code)}>Xoá phòng</button>
          </>
        )}
      </section>
      <FeaturedAdmin />
    </div>
  );
}

function FeaturedAdmin() {
  const local = usePlaylists() ?? [];
  const [featured, setFeatured] = useState<FeaturedPlaylist[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => subscribeFeatured(setFeatured), []);
  const isPub = (id: string) => featured.some((f) => f.id === id);
  const toggle = async (id: string) => {
    setBusy(id);
    try {
      const p = local.find((x) => x.id === id);
      if (isPub(id)) await unpublishFeatured(id);
      else if (p) await publishFeatured(p);
    } finally {
      setBusy(null);
    }
  };
  return (
    <section class="card stack-sm">
      <h2 class="section-title">Playlist đề xuất</h2>
      <p class="hint">Danh sách được đăng sẽ hiện trên trang chủ của mọi người.</p>
      <ul class="dev-songs">
        {local.map((p) => (
          <li key={p.id} class="row feat-row">
            <span class="track-main"><span class="track-name">{p.name}</span><span class="track-meta num">{p.songs.length} bài</span></span>
            <button class="btn btn-small" disabled={busy === p.id} onClick={() => toggle(p.id)}>{isPub(p.id) ? 'Gỡ' : 'Đăng'}</button>
          </li>
        ))}
        {featured.filter((f) => !local.some((l) => l.id === f.id)).map((f) => (
          <li key={f.id} class="row feat-row">
            <span class="track-main"><span class="track-name">{f.name}</span><span class="track-meta">đang đăng</span></span>
            <button class="btn btn-small" onClick={() => unpublishFeatured(f.id)}>Gỡ</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
