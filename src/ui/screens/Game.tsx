import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { engineFor } from '../../audio';
import { SkipSongError, type PrepareOptions } from '../../audio/engine';
import { hasFile, localEngine } from '../../audio/local';
import { youtubeEngine } from '../../audio/youtube';
import { createGame, currentSongId, giveUp, guess, isLastStage, markReady, moreTime, nextSong, roundPoints, skipBroken } from '../../core/game';
import { SOUND_PREVIEW_FRAC, SOUND_PREVIEW_SEC, kindInfo } from '../../core/modes';
import { formatSeconds } from '../../core/stages';
import type { GameKind, GameState, Playlist, PresetId, Song } from '../../core/types';
import { getPlaylist, savePlaylist } from '../../data/db';
import type { Route } from '../App';
import { Burst, ClipBar, CountUp, Cover, StageIndicator, prefetchCovers, shake, type ClipRun } from '../components';
import { CoverPicker, GuessSheet } from '../GuessSheet';
import { usePlayerSlot, useSettings } from '../hooks';
import { IconCheck, IconFlame, IconForward, IconPlay, IconPlus, IconSearch, IconTrophy, IconX } from '../icons';
import { sfx } from '../sfx';
import { SoundPicker } from '../SoundPicker';

interface Props {
  playlistId: string;
  count: number | 'all';
  presetId: PresetId;
  kind: GameKind;
  choices: number;
  go: (r: Route) => void;
}

export function Game(props: Props) {
  const [p, setP] = useState<Playlist | null>(null);
  useEffect(() => void getPlaylist(props.playlistId).then((x) => setP(x ?? null)), [props.playlistId]);
  if (!p) return <p class="muted pad">Đang tải...</p>;
  return <GameRun {...props} playlist={p} />;
}

const playable = (s: Song) => s.source.type === 'youtube' || hasFile(s);

/** Where the clip of queue position `i` starts (random kind: a fixed random point per song). */
const prepOpts = (g: GameState, i: number): PrepareOptions =>
  g.kind === 'random' ? { startFrac: g.fracs[i], clipSec: g.stages[g.stages.length - 1] } : {};
const previewOpts: PrepareOptions = { startFrac: SOUND_PREVIEW_FRAC, clipSec: SOUND_PREVIEW_SEC };

function GameRun({ playlist, count, presetId, kind, choices, go }: Props & { playlist: Playlist }) {
  const settings = useSettings();
  const songs = useMemo(() => new Map(playlist.songs.map((s) => [s.id, s])), [playlist]);
  const [g, setG] = useState<GameState>(() => {
    const ids = playlist.songs.filter(playable).filter((s) => kind !== 'cover' || s.cover).map((s) => s.id);
    return createGame(playlist.id, ids, count, settings.presets[presetId].stages, kind, choices);
  });
  const [sheet, setSheet] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [clip, setClip] = useState<ClipRun | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [needTap, setNeedTap] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  // Sound pick state
  const [soundSel, setSoundSel] = useState<number | null>(null);
  const [soundPlaying, setSoundPlaying] = useState<number | null>(null);
  const [soundLoading, setSoundLoading] = useState<number | null>(null);
  const previewSeq = useRef(0);

  const song = songs.get(currentSongId(g) ?? '');
  const engine = song ? engineFor(song) : null;

  useEffect(() => {
    // Covers for the first screen of the guess grid, so it opens instantly.
    const sorted = playlist.songs.slice().sort((a, b) => a.title.localeCompare(b.title, 'vi'));
    prefetchCovers(sorted.slice(0, 24).map((s) => s.cover));
    return () => {
      youtubeEngine().stopAll();
      localEngine.stop();
    };
  }, []);

  // Prepare phase per song; then load the next one in the background.
  useEffect(() => {
    if (g.phase !== 'preparing' || !song || !engine) return;
    let cancelled = false;
    setNote(null);
    setClip(null);
    setSoundSel(null);
    setSoundPlaying(null);
    (async () => {
      try {
        if (g.kind === 'sound') {
          // Nothing to load up front: each numbered clip loads when tapped.
          prefetchCovers([song.cover]);
          setG(markReady);
          const first = songs.get(g.options[0]);
          if (first) engineFor(first).preload(first, playlist, previewOpts);
          return;
        }
        const yt = youtubeEngine();
        if (song.source.type === 'youtube' && yt.needsTapUnlock()) {
          setNeedTap(true);
          await yt.unlockWithTap(song.source.videoId);
          setNeedTap(false);
        }
        await engine.prepare(song, playlist, prepOpts(g, g.index));
        if (cancelled) return;
        setG(markReady);
        const next = songs.get(g.queue[g.index + 1] ?? '');
        if (next) engineFor(next).preload(next, playlist, prepOpts(g, g.index + 1));
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

  // Save the best score at the end.
  useEffect(() => {
    if (g.phase !== 'end') return;
    engine?.stop();
    if (g.score > 0) sfx.win();
    void getPlaylist(playlist.id).then((fresh) => {
      if (fresh && g.score > fresh.bestScore) return savePlaylist({ ...fresh, bestScore: g.score });
    });
  }, [g.phase]);

  const play = async (stage: number) => {
    if (!engine) return;
    setPlaying(true);
    const ms = Math.round(g.stages[stage] * 1000);
    try {
      await engine.playClip(ms, undefined, (at) => setClip({ start: at, ms, key: at }));
    } finally {
      setPlaying(false);
    }
  };

  const preview = async (i: number) => {
    const s = songs.get(g.options[i]);
    if (!s) return;
    setSoundSel(i);
    const seq = ++previewSeq.current;
    const eng = engineFor(s);
    youtubeEngine().stop();
    localEngine.stop();
    setSoundPlaying(null);
    setSoundLoading(i);
    try {
      await eng.prepare(s, playlist, previewOpts);
      if (seq !== previewSeq.current) return;
      setSoundLoading(null);
      await eng.playClip(SOUND_PREVIEW_SEC * 1000, undefined, (at) => {
        if (seq === previewSeq.current) (setSoundPlaying(i), setClip({ start: at, ms: SOUND_PREVIEW_SEC * 1000, key: at }));
      });
      // Have the next number ready before it is tapped.
      const nx = songs.get(g.options[i + 1] ?? '');
      if (nx && seq === previewSeq.current) engineFor(nx).preload(nx, playlist, previewOpts);
    } catch {
      if (seq === previewSeq.current) setNote(`Đoạn số ${i + 1} không phát được.`);
    } finally {
      if (seq === previewSeq.current) (setSoundLoading(null), setSoundPlaying(null));
    }
  };

  const afterWrong = (n: GameState) => {
    sfx.wrong();
    shake(card.current);
    if (n.kind === 'sound') setNote(isLastStage(n) ? 'Chưa đúng. Còn một lần chọn.' : 'Chưa đúng. Chọn đoạn khác.');
    else {
      setNote(`Chưa đúng. Nghe đoạn ${formatSeconds(n.stages[n.stage])}.`);
      void play(n.stage);
    }
  };

  const onMore = () => {
    const n = moreTime(g);
    setG(n);
    setNote(null);
    if (n.phase === 'ready') {
      sfx.step();
      void play(n.stage);
    } else sfx.reveal();
  };

  const onGuess = (id: string) => {
    setSheet(false);
    const n = guess(g, id);
    setG(n);
    if (n.phase === 'ready') afterWrong(n);
    else {
      setNote(null);
      youtubeEngine().stop();
      localEngine.stop();
      n.results[n.results.length - 1].correct ? sfx.correct() : sfx.wrong();
    }
  };

  const exit = () => {
    youtubeEngine().stopAll();
    localEngine.stop();
    go({ name: 'setup', playlistId: playlist.id });
  };

  if (g.phase === 'end') return <EndScreen g={g} songs={songs} playlist={playlist} go={go} />;
  if (!song) return null;

  const options = g.options.map((id) => songs.get(id)!).filter(Boolean);
  const progress = ((g.index + (g.phase === 'reveal' ? 1 : 0)) / g.queue.length) * 100;
  return (
    <div class="game">
      <div class="game-top">
        <button class="icon-btn" aria-label="Thoát" onClick={exit}><IconX /></button>
        <div class="game-progress">
          <span class="num">Bài {String(g.index + 1).padStart(2, '0')}<span class="muted">/{String(g.queue.length).padStart(2, '0')}</span></span>
          <span class="progress"><i style={{ width: progress + '%' }} /></span>
        </div>
        <div class="game-score">
          <span class="num score"><CountUp value={g.score} /></span>
          <span class={'streak num' + (g.streak > 0 ? ' on' : '')} title="Chuỗi đúng"><IconFlame size={16} />{g.streak}</span>
        </div>
      </div>

      {g.phase === 'reveal' ? (
        <Reveal key={g.index} g={g} song={song} playlist={playlist} onNext={() => { engine?.stop(); sfx.tap(); setG(nextSong(g)); }} />
      ) : g.kind === 'sound' ? (
        <>
          <div class="card sound-card" ref={card}>
            <div class="clip-head">
              <span class="kicker">{kindInfo(g.kind).name}</span>
              <span class="tries" aria-label={`Còn ${g.stages.length - g.stage} lần chọn`}>
                {g.stages.map((_, i) => <i key={i} class={i < g.stage ? 'used' : ''} />)}
              </span>
              <span class="kicker num">+{roundPoints(g)}</span>
            </div>
            <div class="sound-cover"><Cover song={song} q="lg" anonymous /></div>
            <p class="hint center">Ảnh bìa này là của bài nào? Nghe từng số rồi chốt.</p>
          </div>
          <p class="status" role="status">{g.phase === 'preparing' ? 'Đang chuẩn bị...' : note ?? ' '}</p>
          <SoundPicker options={options} sel={soundSel} playing={soundPlaying} loading={soundLoading} wrong={g.wrongGuesses}
            disabled={g.phase !== 'ready'} clipMs={SOUND_PREVIEW_SEC * 1000} playKey={clip?.key ?? 0}
            onPick={(i) => void preview(i)} onSubmit={() => soundSel !== null && onGuess(g.options[soundSel])} />
          <button class="btn btn-ghost btn-block" disabled={g.phase !== 'ready'} onClick={() => (sfx.reveal(), setG(giveUp(g)))}>
            <IconX size={18} /> Chịu thua
          </button>
        </>
      ) : (
        <>
          <div class="card clip-card" ref={card}>
            <div class="clip-head">
              <span class="kicker num">Đoạn {g.stage + 1}/{g.stages.length}</span>
              <span key={g.stage} class="clip-len num">{formatSeconds(g.stages[g.stage])}</span>
              <span class="kicker num">+{roundPoints(g)}</span>
            </div>
            <ClipBar seed={song.id} stages={g.stages} stage={g.stage} clip={clip} />
            <StageIndicator stages={g.stages} stage={g.stage} />
            {g.kind !== 'classic' && <span class="kind-tag">{kindInfo(g.kind).name}</span>}
          </div>

          <p class="status" role="status">
            {g.phase === 'preparing' ? (needTap ? 'Chạm vào video để bật âm thanh' : <span class="loading-dots">Đang chuẩn bị</span>) : note ?? (playing ? 'Đang phát...' : 'Sẵn sàng. Bấm Nghe.')}
          </p>

          <div class="game-actions">
            <button class={'btn btn-primary btn-xl btn-block' + (playing ? ' is-playing' : '')} data-sfx="none" disabled={g.phase !== 'ready' || playing} onClick={() => play(g.stage)}>
              <IconPlay /> {playing ? 'Đang nghe' : 'Nghe'}
            </button>
            <div class="row">
              <button class="btn grow" disabled={g.phase !== 'ready'} onClick={onMore} data-sfx="none">
                {isLastStage(g) ? <><IconX size={18} /> Chịu thua</> : <><IconPlus size={18} /> Thêm một chút</>}
              </button>
              <button class="btn btn-ink grow" disabled={g.phase !== 'ready'} onClick={() => setSheet(true)}>
                <IconSearch size={18} /> {g.kind === 'cover' ? 'Chọn ảnh' : 'Đoán'}
              </button>
            </div>
          </div>
        </>
      )}

      {needTap && <div class="unlock-label">Chạm để bật âm thanh</div>}
      {sheet && g.kind === 'cover' && (
        <CoverPicker songs={options} wrong={g.wrongGuesses} onSubmit={onGuess} onClose={() => (sfx.close(), setSheet(false))} />
      )}
      {sheet && g.kind !== 'cover' && (
        <GuessSheet songs={playlist.songs} wrong={g.wrongGuesses} onSubmit={onGuess} onClose={() => (sfx.close(), setSheet(false))} />
      )}
    </div>
  );
}

function Reveal({ g, song, playlist, onNext }: { g: GameState; song: Song; playlist: Playlist; onNext: () => void }) {
  const r = g.results[g.results.length - 1];
  const slot = useRef<HTMLDivElement>(null);
  // Sound pick: the player holds the last numbered clip, not this song, so no video there.
  const showVideo = song.source.type === 'youtube' && g.kind !== 'sound';
  usePlayerSlot(slot, showVideo);
  const [busy, setBusy] = useState(false);
  const long = async () => {
    setBusy(true);
    try {
      const eng = engineFor(song);
      if (g.kind === 'sound') await eng.prepare(song, playlist, previewOpts);
      await eng.playClip(g.kind === 'sound' ? 8000 : 5000);
    } catch {
      /* unplayable: nothing to do */
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="reveal stack">
      <div class={'verdict ' + (r.correct ? 'ok' : 'bad')}>
        {r.correct ? <><IconCheck /> {g.kind === 'sound' ? `Đúng ở lần chọn ${r.stage + 1}` : `Đúng ở đoạn ${r.stage + 1}`}</> : <><IconX /> Lần này chưa được</>}
        <span class="num verdict-pts">+<CountUp value={r.points} /></span>
        {r.correct && <Burst />}
      </div>
      <div class="reveal-main">
        <div class="reveal-cover"><Cover song={song} q="lg" /></div>
        <div class="reveal-text">
          <h2 class="reveal-title">{song.title}</h2>
          <p class="reveal-artist">{song.artist}</p>
        </div>
      </div>
      {showVideo && <div class="video-slot" ref={slot} />}
      <div class="row">
        <button class="btn grow" disabled={busy} onClick={long} data-sfx="none"><IconPlay size={18} /> Nghe đoạn dài</button>
        <button class="btn btn-primary grow" onClick={onNext} data-sfx="none">
          {g.index + 1 >= g.queue.length ? 'Xem kết quả' : 'Bài tiếp'} <IconForward size={18} />
        </button>
      </div>
    </div>
  );
}

function EndScreen({ g, songs, playlist, go }: { g: GameState; songs: Map<string, Song>; playlist: Playlist; go: (r: Route) => void }) {
  const correct = g.results.filter((r) => r.correct).length;
  const isBest = g.score > 0 && g.score > playlist.bestScore;
  return (
    <div class="stack end">
      <p class="kicker">Kết thúc · {playlist.name} · {kindInfo(g.kind).name}</p>
      <div class="end-score">
        <span class="num"><CountUp value={g.score} ms={1100} /></span>
        <small>điểm</small>
        {isBest && <span class="record"><IconTrophy size={18} /> Kỷ lục mới<Burst n={22} /></span>}
      </div>
      <div class="end-stats num">
        <div class="stat"><b>{correct}/{g.results.length}</b><span>bài đúng</span></div>
        <div class="stat"><b>{g.bestStreak}</b><span>chuỗi dài nhất</span></div>
        <div class="stat"><b>{Math.max(playlist.bestScore, g.score).toLocaleString('vi-VN')}</b><span>kỷ lục</span></div>
      </div>
      <ol class="result-list">
        {g.results.map((r, i) => {
          const s = songs.get(r.songId)!;
          return (
            <li key={r.songId + i} class={r.correct ? 'ok' : 'bad'} style={{ animationDelay: Math.min(i, 12) * 40 + 'ms' }}>
              <span class="track-no num">{String(i + 1).padStart(2, '0')}</span>
              <Cover song={s} size={48} />
              <span class="track-main">
                <span class="track-name">{s.title}</span>
                <span class="track-meta">{s.artist}</span>
              </span>
              <span class="num result-pts">{r.correct ? `+${r.points}` : '0'}<small>{r.correct ? (g.kind === 'sound' ? `lần ${r.stage + 1}` : `đoạn ${r.stage + 1}`) : 'trượt'}</small></span>
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
