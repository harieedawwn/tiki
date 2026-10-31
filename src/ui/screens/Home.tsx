import { useEffect, useState } from 'preact/hooks';
import { multiplayerAvailable } from '../../config';
import { ROOM_CODE_RE, normalizeRoomCode } from '../../core/match';
import { playerName, setPlayerName } from '../../multi/identity';
import type { Playlist } from '../../core/types';
import { getPlaylist, listPlaylists, onPlaylistsChanged, savePlaylist } from '../../data/db';
import { importLocalFiles } from '../../data/localImport';
import { ImportError, importYouTubePlaylist } from '../../data/youtubeApi';
import type { Route } from '../App';
import { Cover, ErrorBox } from '../components';
import { useSettings } from '../hooks';
import { formatSeconds } from '../../core/stages';
import { IconFolder, IconForward, IconLink, IconMusic, IconUser, IconUsers, Logo } from '../icons';
import type { FeaturedPlaylist } from '../../multi/types';

export function usePlaylists(): Playlist[] | null {
  const [list, setList] = useState<Playlist[] | null>(null);
  useEffect(() => {
    const load = () => listPlaylists().then(setList).catch(() => setList([]));
    load();
    return onPlaylistsChanged(load);
  }, []);
  return list;
}

/** Keeps per-song offsets/renames and the best score when re-importing the same playlist. */
async function mergeAndSave(p: Playlist): Promise<void> {
  const old = await getPlaylist(p.id);
  if (old) {
    const prev = new Map(old.songs.map((s) => [s.id, s]));
    p.songs = p.songs.map((s) => {
      const o = prev.get(s.id);
      return o ? { ...s, title: o.title, artist: o.artist, startOffsetMs: o.startOffsetMs } : s;
    });
    p.bestScore = old.bestScore;
    p.defaultOffsetMs = old.defaultOffsetMs;
    p.createdAt = old.createdAt;
  }
  await savePlaylist(p);
}

/** "Playlist đề xuất" from /featured (loads the Firebase chunk lazily). */
function useFeatured(): FeaturedPlaylist[] {
  const [list, setList] = useState<FeaturedPlaylist[]>([]);
  useEffect(() => {
    if (!multiplayerAvailable()) return;
    let un: (() => void) | undefined, dead = false;
    void import('../../multi/room').then((m) => {
      if (!dead) un = m.subscribeFeatured(setList);
    });
    return () => {
      dead = true;
      un?.();
    };
  }, []);
  return list;
}

function Multiplayer({ go }: { go: (r: Route) => void }) {
  const [name, setName] = useState(playerName);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!multiplayerAvailable()) return null;
  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const { createRoom } = await import('../../multi/room');
      setPlayerName(name);
      go({ name: 'room', code: await createRoom(name.trim()) });
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Không tạo được phòng. Kiểm tra mạng.');
    } finally {
      setBusy(false);
    }
  };
  const join = (e: Event) => {
    e.preventDefault();
    setPlayerName(name);
    go({ name: 'room', code });
  };
  return (
    <section class="card stack-sm card-in">
      <h2 class="section-title"><span class="section-icon"><IconUsers size={20} /></span> Chơi cùng bạn bè</h2>
      <p class="hint">Cả phòng nghe cùng một lúc, ai đoán nhanh hơn được nhiều điểm hơn.</p>
      <input class="input" placeholder="Tên của bạn" maxLength={24} value={name} aria-label="Tên của bạn" onInput={(e) => setName(e.currentTarget.value)} />
      <button class="btn btn-primary btn-block" disabled={!name.trim() || busy} onClick={create}>{busy ? 'Đang tạo...' : 'Tạo phòng'}</button>
      <form class="row" onSubmit={join}>
        <input class="input grow num code-input" placeholder="Mã phòng" maxLength={5} value={code} aria-label="Mã phòng" autocapitalize="characters"
          onInput={(e) => setCode(normalizeRoomCode(e.currentTarget.value))} />
        <button class="btn" type="submit" disabled={!ROOM_CODE_RE.test(code) || !name.trim()}>Vào phòng</button>
      </form>
      {error && <ErrorBox>{error}</ErrorBox>}
    </section>
  );
}

const LOGO_BARS = [30, 55, 40, 80, 60, 95, 70, 50, 85, 45, 65, 35, 75, 55, 90, 40, 60, 30, 50, 72, 44, 64, 36, 58];

export function Home({ go }: { go: (r: Route) => void }) {
  const settings = useSettings();
  const playlists = usePlaylists();
  const featured = useFeatured().filter((f) => !playlists?.some((p) => p.id === f.id));
  const openFeatured = async (f: FeaturedPlaylist) => {
    await savePlaylist({ id: f.id, name: f.name, kind: f.kind, songs: f.songs ?? [], defaultOffsetMs: f.defaultOffsetMs ?? 0, bestScore: 0, createdAt: Date.now() });
    go({ name: 'setup', playlistId: f.id });
  };
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<Playlist>) => {
    setError(null);
    setBusy('Đang nhập...');
    try {
      const p = await fn();
      await mergeAndSave(p);
      setLink('');
      go({ name: 'setup', playlistId: p.id });
    } catch (e) {
      setError(e instanceof ImportError || e instanceof Error ? e.message : 'Có lỗi xảy ra.');
    } finally {
      setBusy(null);
    }
  };

  const onFiles = (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    if (files.length) void run(() => importLocalFiles(files, setBusy));
  };

  return (
    <div class="stack">
      <section class="hero-card" aria-label="Tiki">
        <div class="hero-top">
          <Logo size={56} />
          <div>
            <h1 class="hero-word">Tiki</h1>
            <p class="hero-tag">Nghe một chút. Đoán thật nhanh.</p>
          </div>
        </div>
        <div class="hero-eq" aria-hidden="true">
          {LOGO_BARS.map((h, i) => <i key={i} style={{ height: h + '%', animationDelay: (i % 7) * -130 + 'ms' }} />)}
        </div>
        <ol class="hero-stages num" aria-label="Các đoạn nghe">
          {settings.presets.tichtac.stages.map((st, i) => <li key={st} style={{ animationDelay: 200 + i * 90 + 'ms' }}>{formatSeconds(st)}</li>)}
        </ol>
      </section>

      <Multiplayer go={go} />

      {featured.length > 0 && (
        <section class="stack-sm">
          <h2 class="section-title">Playlist đề xuất</h2>
          <ol class="playlist-list">
            {featured.map((f, i) => (
              <li key={f.id} style={{ animationDelay: Math.min(i, 8) * 40 + 'ms' }}>
                <button class="track" onClick={() => openFeatured(f)}>
                  <span class="mosaic mosaic-sm" aria-hidden="true">{(f.songs ?? []).filter((s) => s.cover).slice(0, 4).map((s) => <Cover key={s.id} song={s} />)}</span>
                  <span class="track-main">
                    <span class="track-name">{f.name}</span>
                    <span class="track-meta num">{f.kind === 'youtube' ? 'YouTube' : 'Trên máy'} · {f.songs?.length ?? 0} bài</span>
                  </span>
                  <IconForward size={20} />
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section class="stack-sm">
        <h2 class="section-title"><span class="section-icon"><IconUser size={20} /></span> Chơi một mình</h2>
        {playlists === null ? (
          <p class="muted">Đang tải...</p>
        ) : playlists.length === 0 ? (
          <p class="muted">Chưa có nhạc. Thêm danh sách ở dưới.</p>
        ) : (
          <ol class="playlist-list">
            {playlists.map((p, i) => (
              <li key={p.id} style={{ animationDelay: Math.min(i, 8) * 40 + 'ms' }}>
                <button class="track" onClick={() => go({ name: 'setup', playlistId: p.id })}>
                  <span class="mosaic mosaic-sm" aria-hidden="true">{p.songs.filter((s) => s.cover).slice(0, 4).map((s) => <Cover key={s.id} song={s} />)}</span>
                  <span class="track-main">
                    <span class="track-name">{p.name}</span>
                    <span class="track-meta num">
                      {p.kind === 'youtube' ? 'YouTube' : 'Trên máy'} · {p.songs.length} bài
                      {p.bestScore > 0 && <> · Kỷ lục {p.bestScore.toLocaleString('vi-VN')}</>}
                    </span>
                  </span>
                  <IconForward size={20} />
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section class="card stack-sm">
        <h2 class="section-title"><span class="section-icon"><IconMusic size={20} /></span> Thêm nhạc</h2>
        <form class="row" onSubmit={(e) => (e.preventDefault(), link.trim() && run(() => importYouTubePlaylist(link, setBusy)))}>
          <input class="input grow" type="url" inputMode="url" placeholder="Link playlist YouTube"
            value={link} onInput={(e) => setLink(e.currentTarget.value)} aria-label="Liên kết danh sách phát" />
          <button class="btn btn-primary" type="submit" disabled={!!busy || !link.trim()} aria-label="Nhập playlist"><IconLink size={20} /></button>
        </form>
        <div class="row wrap">
          <label class="btn grow">
            <IconMusic size={18} /> Chọn tệp
            <input type="file" accept="audio/*,.mp3,.m4a,.flac,.ogg,.opus,.wav" multiple hidden onChange={onFiles} />
          </label>
          <label class="btn grow">
            <IconFolder size={18} /> Chọn thư mục
            <input type="file" multiple hidden onChange={onFiles} {...{ webkitdirectory: '' }} />
          </label>
        </div>
      </section>

      {busy && <p class="status num" role="status">{busy}</p>}
      {error && <ErrorBox>{error}</ErrorBox>}
    </div>
  );
}
