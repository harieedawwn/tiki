import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { engineFor } from '../../audio';
import { SkipSongError } from '../../audio/engine';
import { hasFile, localEngine } from '../../audio/local';
import { youtubeEngine } from '../../audio/youtube';
import { createGame, currentSongId, guess, isLastStage, markReady, moreTime, nextSong, skipBroken } from '../../core/game';
import { pointsForStage } from '../../core/scoring';
import { formatSeconds } from '../../core/stages';
import type { GameState, Playlist, PresetId, Song } from '../../core/types';
import { getPlaylist, savePlaylist } from '../../data/db';
import type { Route } from '../App';
import { ClipBar, Cover, StageIndicator } from '../components';
import { GuessSheet } from '../GuessSheet';
import { usePlayerSlot, useSettings } from '../hooks';
import { IconCheck, IconFlame, IconForward, IconPlay, IconPlus, IconSearch, IconX } from '../icons';

interface Props {
  playlistId: string;
  count: number | 'all';
  presetId: PresetId;
  go: (r: Route) => void;
}

export function Game(props: Props) {
  const [p, setP] = useState<Playlist | null>(null);
  useEffect(() => void getPlaylist(props.playlistId).then((x) => setP(x ?? null)), [props.playlistId]);
  if (!p) return <p class="muted pad">Đang tải...</p>;
  return <GameRun {...props} playlist={p} />;
}

function GameRun({ playlist, count, presetId, go }: Props & { playlist: Playlist }) {
  const settings = useSettings();
  const songs = useMemo(() => new Map(playlist.songs.map((s) => [s.id, s])), [playlist]);
  const [g, setG] = useState<GameState>(() =>
    createGame(playlist.id, playlist.songs.filter((s) => s.source.type === 'youtube' || hasFile(s)).map((s) => s.id),
      count, settings.presets[presetId].stages));
  const [sheet, setSheet] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [pulse, setPulse] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [needTap, setNeedTap] = useState(false);

  const song = songs.get(currentSongId(g) ?? '');
  const engine = song ? engineFor(song) : null;

  // Prepare phase per song.
  useEffect(() => {
    if (g.phase !== 'preparing' || !song || !engine) return;
    let cancelled = false;
    setNote(null);
    (async () => {
      try {
        const yt = youtubeEngine();
        if (song.source.type === 'youtube' && yt.needsTapUnlock()) {
          setNeedTap(true);
          await yt.unlockWithTap(song.source.videoId);
          setNeedTap(false);
        }
        await engine.prepare(song, playlist);
        if (cancelled) return;
        setG(markReady);
        const next = songs.get(g.queue[g.index + 1] ?? '');
        if (next?.source.type === 'local') localEngine.preload(next);
      } catch (e) {
        if (cancelled) return;
        setNote(e instanceof SkipSongError ? `Bỏ qua "${song.title}" vì không phát được.` : 'Không phát được bài này, chuyển bài.');
        setG(skipBroken);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [g.phase, g.index, g.queue.length]);

  // Save the best score at the end; stop audio when leaving.
  useEffect(() => {
    if (g.phase !== 'end') return;
    engine?.stop();
    void getPlaylist(playlist.id).then((fresh) => {
      if (fresh && g.score > fresh.bestScore) return savePlaylist({ ...fresh, bestScore: g.score });
    });
  }, [g.phase]);
  useEffect(() => () => engine?.stop(), []);

  const play = async (stage: number) => {
    if (!engine) return;
    setPlaying(true);
    setPulse((n) => n + 1);
    try {
      await engine.playClip(Math.round(g.stages[stage] * 1000));
    } finally {
      setPlaying(false);
    }
  };

  const onMore = () => {
    const n = moreTime(g);
    setG(n);
    setNote(null);
    if (n.phase === 'ready') void play(n.stage);
  };

  const onGuess = (id: string) => {
    setSheet(false);
    const n = guess(g, id);
    setG(n);
    if (n.phase === 'ready') {
      setNote(`Chưa đúng. Nghe đoạn ${formatSeconds(n.stages[n.stage])}.`);
      void play(n.stage);
    } else setNote(null);
  };

  const exit = () => {
    engine?.stop();
    go({ name: 'setup', playlistId: playlist.id });
  };

  if (g.phase === 'end') return <EndScreen g={g} songs={songs} playlist={playlist} go={go} />;
  if (!song) return null;

  const allSongs = playlist.songs;
  return (
    <div class="game">
      <div class="game-top">
        <button class="icon-btn" aria-label="Thoát" onClick={exit}><IconX /></button>
        <div class="game-progress num">Bài {String(g.index + 1).padStart(2, '0')}<span class="muted">/{String(g.queue.length).padStart(2, '0')}</span></div>
        <div class="game-score">
          <span class="num score">{g.score.toLocaleString('vi-VN')}</span>
          <span class={'streak num' + (g.streak > 0 ? ' on' : '')} title="Chuỗi đúng"><IconFlame size={16} />{g.streak}</span>
        </div>
      </div>

      {g.phase === 'reveal' ? (
        <Reveal g={g} song={song} onNext={() => { engine?.stop(); setG(nextSong(g)); }} />
      ) : (
        <>
          <div class="card clip-card">
            <div class="clip-head">
              <span class="kicker num">Đoạn {g.stage + 1}/{g.stages.length}</span>
              <span class="clip-len num">{formatSeconds(g.stages[g.stage])}</span>
              <span class="kicker num">+{pointsForStage(g.stage)}</span>
            </div>
            <ClipBar seed={song.id} stages={g.stages} stage={g.stage} pulse={pulse} />
            <StageIndicator stages={g.stages} stage={g.stage} />
          </div>

          <p class="status" role="status">
            {g.phase === 'preparing' ? (needTap ? 'Chạm vào video để bật âm thanh' : 'Đang chuẩn bị...') : note ?? (playing ? 'Đang phát...' : 'Sẵn sàng. Bấm Nghe.')}
          </p>

          <div class="game-actions">
            <button class="btn btn-primary btn-xl btn-block" disabled={g.phase !== 'ready' || playing} onClick={() => play(g.stage)}>
              <IconPlay /> Nghe
            </button>
            <div class="row">
              <button class="btn grow" disabled={g.phase !== 'ready'} onClick={onMore}>
                {isLastStage(g) ? <><IconX size={18} /> Chịu thua</> : <><IconPlus size={18} /> Thêm một chút</>}
              </button>
              <button class="btn btn-ink grow" disabled={g.phase !== 'ready'} onClick={() => setSheet(true)}>
                <IconSearch size={18} /> Đoán
              </button>
            </div>
          </div>
        </>
      )}

      {needTap && <div class="unlock-label">Chạm để bật âm thanh</div>}
      {sheet && <GuessSheet songs={allSongs} wrong={g.wrongGuesses} onSubmit={onGuess} onClose={() => setSheet(false)} />}
    </div>
  );
}

function Reveal({ g, song, onNext }: { g: GameState; song: Song; onNext: () => void }) {
  const r = g.results[g.results.length - 1];
  const slot = useRef<HTMLDivElement>(null);
  const isYT = song.source.type === 'youtube';
  usePlayerSlot(slot, isYT);
  const [busy, setBusy] = useState(false);
  const long = async () => {
    setBusy(true);
    try {
      await engineFor(song).playClip(5000);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="reveal stack">
      <div class={'verdict ' + (r.correct ? 'ok' : 'bad')}>
        {r.correct ? <><IconCheck /> Đúng ở đoạn {r.stage + 1}</> : <><IconX /> Lần này chưa được</>}
        <span class="num verdict-pts">+{r.points}</span>
      </div>
      <div class="reveal-cover"><Cover song={song} /></div>
      <div>
        <h2 class="display display-sm reveal-title">{song.title}</h2>
        <p class="reveal-artist">{song.artist}</p>
      </div>
      {isYT && <div class="video-slot" ref={slot} />}
      <div class="row">
        <button class="btn grow" disabled={busy} onClick={long}><IconPlay size={18} /> Nghe đoạn dài</button>
        <button class="btn btn-primary grow" onClick={onNext}>
          {g.index + 1 >= g.queue.length ? 'Xem kết quả' : 'Bài tiếp'} <IconForward size={18} />
        </button>
      </div>
    </div>
  );
}

function EndScreen({ g, songs, playlist, go }: { g: GameState; songs: Map<string, Song>; playlist: Playlist; go: (r: Route) => void }) {
  const correct = g.results.filter((r) => r.correct).length;
  const isBest = g.score > 0 && g.score >= playlist.bestScore;
  return (
    <div class="stack end">
      <p class="kicker">Kết thúc · {playlist.name}</p>
      <div class="end-score">
        <span class="num">{g.score.toLocaleString('vi-VN')}</span>
        <small>điểm</small>
      </div>
      <div class="row end-stats num">
        <div class="stat"><b>{correct}/{g.results.length}</b><span>bài đúng</span></div>
        <div class="stat"><b>{g.bestStreak}</b><span>chuỗi dài nhất</span></div>
        <div class="stat"><b>{Math.max(playlist.bestScore, g.score).toLocaleString('vi-VN')}</b><span>{isBest ? 'kỷ lục mới' : 'kỷ lục'}</span></div>
      </div>
      <ol class="result-list">
        {g.results.map((r, i) => {
          const s = songs.get(r.songId)!;
          return (
            <li key={r.songId} class={r.correct ? 'ok' : 'bad'}>
              <span class="track-no num">{String(i + 1).padStart(2, '0')}</span>
              <Cover song={s} size={48} />
              <span class="track-main">
                <span class="track-name">{s.title}</span>
                <span class="track-meta">{s.artist}</span>
              </span>
              <span class="num result-pts">{r.correct ? `+${r.points}` : '0'}<small>{r.correct ? `đoạn ${r.stage + 1}` : 'trượt'}</small></span>
            </li>
          );
        })}
      </ol>
      <div class="row">
        <button class="btn grow" onClick={() => go({ name: 'home' })}>Trang chủ</button>
        <button class="btn btn-primary grow" onClick={() => go({ name: 'setup', playlistId: playlist.id })}>Chơi lại</button>
      </div>
    </div>
  );
}
