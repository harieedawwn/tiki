import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { clampOpts, rankChanges, rankPlayers, stageWindowMs } from '../../core/match';
import { SOUND_PREVIEW_SEC, kindInfo, soundPoints } from '../../core/modes';
import { pointsForStage } from '../../core/scoring';
import { formatSeconds } from '../../core/stages';
import type { Song } from '../../core/types';
import { updateSettings } from '../../data/settings';
import { serverNow } from '../../multi/firebase';
import { becomeHost, sendCommand, setLocked, startRoundNow, submitGuess, voteSkip } from '../../multi/room';
import type { RoomSession, SessionState } from '../../multi/session';
import type { Room, RoundState } from '../../multi/types';
import { Burst, ClipBar, CountUp, CountdownOverlay, Cover, StageIndicator, shake } from '../components';
import { CoverPicker, GuessSheet } from '../GuessSheet';
import { useSettings } from '../hooks';
import { IconCheck, IconEye, IconForward, IconLock, IconPause, IconPlay, IconSearch, IconSkip, IconVolume, IconVolumeOff, IconX } from '../icons';
import { sfx } from '../sfx';
import { SoundPicker } from '../SoundPicker';
import { RankList, useTicker, type Perms, type Row } from './parts';

export function ModBar({ code, room, perms }: { code: string; room: Room; perms: Perms }) {
  if (!perms.isMod && !perms.isDev) return null;
  const paused = room.meta.status === 'paused';
  const live = room.meta.status === 'playing' || paused;
  return (
    <div class="modbar" role="toolbar" aria-label="Điều hành phòng">
      {perms.isMod && live && (
        <>
          <button class="chip" onClick={() => sendCommand(code, paused ? 'resume' : 'pause')}>
            {paused ? <><IconPlay size={16} /> Tiếp tục</> : <><IconPause size={16} /> Tạm dừng</>}
          </button>
          <button class="chip" disabled={paused} onClick={() => sendCommand(code, 'skip')}><IconSkip size={16} /> Bỏ qua bài</button>
          <button class="chip" onClick={() => confirm('Kết thúc trận ngay?') && sendCommand(code, 'end')}><IconX size={16} /> Kết thúc</button>
        </>
      )}
      {perms.isMod && (
        <button class="chip" aria-pressed={room.meta.locked} onClick={() => setLocked(code, !room.meta.locked)}>
          <IconLock size={16} /> {room.meta.locked ? 'Mở khoá phòng' : 'Khoá phòng'}
        </button>
      )}
      {perms.isDev && !perms.isHost && <button class="chip" onClick={() => becomeHost(code)}>Làm chủ phòng</button>}
    </div>
  );
}

const asSongs = (room: Room): Song[] =>
  (room.playlist?.songs ?? []).map((s) => ({ ...s, source: { type: 'youtube', videoId: '' }, startOffsetMs: null }) as Song);

export function Match({ code, room, session, state, perms }: {
  code: string; room: Room; session: RoomSession; state: SessionState; perms: Perms;
}) {
  const settings = useSettings();
  const round = room.round;
  const opts = clampOpts(room.meta.opts);
  const players = Object.entries(room.players ?? {}).map(([id, p]) => ({ ...p, id, score: p.score ?? 0 }));
  const ranked = rankPlayers(players);
  const me = ranked.find((p) => p.id === perms.pid);
  // The guess list carries no sources; a placeholder keeps the Song shape for the pickers.
  const songs = useMemo(() => asSongs(room), [room.playlist]);
  const [sheet, setSheet] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  // Local guess feedback: the host validates, so a guess is "pending" until it answers.
  const [pending, setPending] = useState<string | null>(null);
  const [wrongIds, setWrongIds] = useState<string[]>([]);
  const [wrongFlash, setWrongFlash] = useState(false);
  const [soundSel, setSoundSel] = useState<number | null>(null);
  const [myPick, setMyPick] = useState<string | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const myWrong = round?.wrong?.[perms.pid]?.n ?? 0;
  const myResult = round?.results?.[perms.pid];
  const roundIdx = round?.index;
  // Re-render only while a cooldown label is counting down.
  useTicker(cooldownUntil > Date.now() || wrongFlash ? 250 : 0);

  useEffect(() => {
    setWrongIds([]);
    setPending(null);
    setWrongFlash(false);
    setSoundSel(null);
    setMyPick(null);
    setSheet(false);
  }, [roundIdx]);
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setPending(null), 4000);
    return () => clearTimeout(t);
  }, [pending]);
  useEffect(() => {
    if (!myWrong) return;
    setCooldownUntil(Date.now() + room.meta.settings.cooldownSec * 1000);
    if (pending) setWrongIds((w) => [...w, pending]);
    setPending(null);
    setWrongFlash(true);
    sfx.wrong();
    shake(card.current);
    const t = setTimeout(() => setWrongFlash(false), 2500);
    return () => clearTimeout(t);
  }, [myWrong]);
  useEffect(() => {
    if (!myResult) return;
    if (pending) setMyPick(pending);
    setPending(null);
    sfx.correct();
  }, [!!myResult]);

  if (!round || typeof round.index !== 'number') return <p class="status"><span class="loading-dots">Đang chuẩn bị vòng đầu</span></p>;
  if (round.phase === 'reveal') return <Reveal room={room} perms={perms} session={session} />;

  const s = room.meta.settings;
  const kind = round.kind ?? 'classic';
  const roundLabel = round.suddenDeath ? 'Phân định' : `Vòng ${round.index + 1}/${s.rounds}`;
  const eliminated = !!room.players?.[perms.pid]?.eliminated;
  const notInSudden = !!round.suddenDeath && !(room.meta.suddenDeath ?? []).includes(perms.pid);
  const spectating = session.isSpectating(room);
  const cooldown = Math.max(0, cooldownUntil - Date.now());
  const paused = room.meta.status === 'paused';
  const canGuess = round.phase === 'playing' && !spectating && !paused;
  const guessDisabled = !canGuess || cooldown > 0 || !!pending;

  const correctNames = Object.keys(round.results ?? {}).map((id) => room.players?.[id]?.name).filter(Boolean);
  const top: Row[] = ranked.slice(0, 3).map((p) => ({ id: p.id, name: p.name, rank: p.rank, value: p.score, tag: round.results?.[p.id] ? 'đúng' : undefined, dim: !!p.eliminated }));
  if (me && !top.some((r) => r.id === me.id)) top.push({ id: me.id, name: me.name, rank: me.rank, value: me.score, tag: round.results?.[me.id] ? 'đúng' : undefined });
  const options = (round.options ?? []).map((i) => songs[i]).filter(Boolean);
  const submit = (id: string) => {
    setPending(id);
    void submitGuess(code, round.index, id).catch(() => setPending(null));
    setSheet(false);
  };
  const feedback = myResult ? null
    : spectating ? (eliminated ? 'Bạn đã bị loại, đang xem.' : notInSudden ? 'Đang phân định giữa những người bằng điểm.' : null)
    : pending ? 'Đang kiểm tra...'
    : wrongFlash ? (cooldown > 0 ? `Chưa đúng. Đoán lại sau ${Math.ceil(cooldown / 1000)} giây.` : 'Chưa đúng. Đoán lại đi.')
    : null;
  const pickedSong = myPick ? songs.find((x) => x.id === myPick) : null;

  return (
    <div class="game">
      <div class="game-top">
        <div class="game-progress">
          <span class="num">{roundLabel}</span>
          <span class="muted small">{kindInfo(kind).name}</span>
        </div>
        <div class="game-score">
          <span class="num score"><CountUp value={me?.score ?? 0} /></span>
          {me && <span class="streak on num">#{me.rank}</span>}
        </div>
      </div>

      {round.phase === 'loading' ? (
        <LoadingCard code={code} room={room} round={round} state={state} perms={perms} manual={opts.flow === 'manual'} />
      ) : kind === 'sound' ? (
        <div class="card sound-card" ref={card}>
          <div class="clip-head">
            <span class="kicker">Ảnh bìa này là bài nào?</span>
            <span class="kicker num">+{soundPoints(myWrong)}</span>
          </div>
          <div class="sound-cover">{round.cover ? <Cover song={{ cover: round.cover, title: '' }} q="lg" anonymous /> : null}</div>
          <TimeLeft room={room} round={round} />
        </div>
      ) : (
        <div class="card clip-card" ref={card}>
          <div class="clip-head">
            <span class="kicker num">Đoạn {round.stage + 1}/{round.stages.length}</span>
            <span key={round.stage} class="clip-len num">{formatSeconds(round.stages[round.stage])}</span>
            <span class="kicker num">+{pointsForStage(round.stage)}</span>
          </div>
          <ClipBar seed={`${code}:${round.index}`} stages={round.stages} stage={round.stage} clip={state.clip} />
          <StageIndicator stages={round.stages} stage={round.stage} />
        </div>
      )}

      {myResult ? (
        <div class="spectate card">
          <div class="spectate-head">
            <span class="verdict-chip ok"><IconCheck size={18} /> Đúng rồi <b class="num">+{myResult.points}</b><Burst n={14} /></span>
            {pickedSong && <span class="spectate-song"><Cover song={pickedSong} size={36} /><span>{pickedSong.title}</span></span>}
          </div>
          {kind !== 'sound' && <ListenToggle on={settings.listenSpectating} session={session} />}
        </div>
      ) : spectating ? (
        <div class="spectate card">
          <p class="row"><IconEye size={18} /> {feedback}</p>
          {kind !== 'sound' && <ListenToggle on={settings.listenSpectating} session={session} />}
        </div>
      ) : (
        <p class="status" role="status">{feedback ?? <StatusLine room={room} round={round} state={state} />}</p>
      )}

      {round.phase === 'playing' && !spectating && kind === 'sound' && (
        <SoundPicker options={options} sel={soundSel} playing={state.preview && !state.preview.loading ? state.preview.i : null}
          loading={state.preview?.loading ? state.preview.i : null} wrong={wrongIds} disabled={guessDisabled}
          clipMs={SOUND_PREVIEW_SEC * 1000} playKey={state.clip?.key ?? 0}
          onPick={(i) => (setSoundSel(i), void session.previewOption(round, i))}
          onSubmit={() => soundSel !== null && options[soundSel] && submit(options[soundSel].id)} />
      )}
      {round.phase === 'playing' && kind !== 'sound' && !spectating && (
        <div class="row">
          <button class="btn grow" data-sfx="none" disabled={!state.audioReady || paused} onClick={() => session.playStage(round)}>
            <IconPlay size={18} /> Nghe lại
          </button>
          <button class="btn btn-primary grow" disabled={!canGuess} onClick={() => setSheet(true)}>
            <IconSearch size={18} /> {kind === 'cover' ? 'Chọn ảnh' : 'Đoán'}
          </button>
        </div>
      )}

      {round.phase === 'playing' && !spectating && !paused && <SkipVote key={`${round.index}:${round.stage}`} code={code} room={room} round={round} pid={perms.pid} />}

      <section class="stack-xs">
        <h3 class="kicker">Bảng xếp hạng</h3>
        <RankList rows={top} me={perms.pid} ellipsis />
        {correctNames.length > 0 && <p class="hint row-inline"><IconCheck size={14} /> Đã đoán đúng: {correctNames.join(', ')}</p>}
      </section>

      {sheet && kind === 'cover' && (
        <CoverPicker songs={options} wrong={wrongIds} disabled={guessDisabled} disabledLabel={cooldown > 0 ? `Chờ ${Math.ceil(cooldown / 1000)} giây` : undefined}
          onSubmit={submit} onClose={() => (sfx.close(), setSheet(false))} />
      )}
      {sheet && kind !== 'cover' && kind !== 'sound' && (
        <GuessSheet songs={songs} wrong={wrongIds} disabled={guessDisabled} disabledLabel={cooldown > 0 ? `Chờ ${Math.ceil(cooldown / 1000)} giây` : undefined}
          onSubmit={submit} onClose={() => (sfx.close(), setSheet(false))} />
      )}
      {round.phase === 'playing' && !paused && !sheet && <Countdown round={round} />}
      {state.needTap && <div class="unlock-label">Chạm để bật âm thanh</div>}
    </div>
  );
}

/** Vote to skip the current stage; when everyone still guessing votes, the host moves on. */
function SkipVote({ code, room, round, pid }: { code: string; room: Room; round: RoundState; pid: string }) {
  const sd = round.suddenDeath ? new Set(room.meta.suddenDeath ?? []) : null;
  const voters = Object.entries(room.players ?? {})
    .filter(([id, p]) => p.connected && !p.eliminated && (!sd || sd.has(id)) && !round.results?.[id]);
  const votes = voters.filter(([id]) => round.skipVotes?.[id] === round.stage).length;
  const mine = round.skipVotes?.[pid] === round.stage;
  const last = round.stage >= round.stages.length - 1;
  const total = Math.max(1, voters.length);
  return (
    <button class={'skip-vote' + (mine ? ' voted' : '')} disabled={mine} data-sfx="none"
      onClick={() => (sfx.step(), void voteSkip(code, round.stage).catch(() => {}))}>
      <span class="skip-fill" style={{ transform: `scaleX(${votes / total})` }} />
      <span class="skip-ico"><IconSkip size={18} /></span>
      <span class="grow skip-label">{mine ? 'Đã bỏ phiếu, chờ mọi người' : last ? 'Bỏ phiếu bỏ qua bài này' : 'Bỏ phiếu nghe đoạn dài hơn'}</span>
      <span class="skip-dots" aria-hidden="true">{voters.map(([id], i) => <i key={id} class={i < votes ? 'on' : ''} />)}</span>
      <span class="num skip-count">{votes}/{voters.length}</span>
    </button>
  );
}

function ListenToggle({ on, session }: { on: boolean; session: RoomSession }) {
  return (
    <button class={'listen-toggle' + (on ? ' on' : '')} role="switch" aria-checked={on} data-sfx="none"
      onClick={() => {
        updateSettings({ listenSpectating: !on });
        session.setListening(!on);
        sfx.toggle(!on);
      }}>
      <span class="listen-ico">{on ? <IconVolume size={20} /> : <IconVolumeOff size={20} />}</span>
      <span class="grow">
        <b>{on ? 'Đang nghe nhạc' : 'Đã tắt nhạc trên máy này'}</b>
        <small>{on ? 'Tắt nếu cả nhóm đang nghe chung một máy' : 'Bật lại khi bạn chơi online'}</small>
      </span>
      <span class="switch-knob" aria-hidden="true" />
    </button>
  );
}

function LoadingCard({ code, room, round, state, perms, manual }: {
  code: string; room: Room; round: RoundState; state: SessionState; perms: Perms; manual: boolean;
}) {
  const active = Object.entries(room.players ?? {}).filter(([, p]) => p.connected && !p.eliminated);
  const ready = active.filter(([id]) => round.ready?.[id] === round.index).length;
  return (
    <div class="card loading-card">
      <div class="loading-eq" aria-hidden="true"><i /><i /><i /><i /><i /></div>
      <p class="status">
        {state.needTap ? 'Chạm vào video để bật âm thanh' : state.audioError ?? (state.audioReady || round.kind === 'sound' ? 'Máy bạn đã sẵn sàng' : <span class="loading-dots">Đang tải bài</span>)}
      </p>
      <p class="hint num center">{ready}/{active.length} người sẵn sàng</p>
      {manual && (perms.isHost ? (
        <button class="btn btn-primary btn-lg btn-block" onClick={() => startRoundNow(code)} disabled={room.meta.status !== 'playing'}>
          <IconPlay /> {ready < active.length ? `Bắt đầu (${active.length - ready} người chưa xong)` : 'Bắt đầu vòng'}
        </button>
      ) : <p class="hint center">Chờ chủ phòng bấm bắt đầu...</p>)}
    </div>
  );
}

/** Status text with its own 4 Hz ticker, so the rest of the screen does not re-render. */
function StatusLine({ room, round, state }: { room: Room; round: RoundState; state: SessionState }) {
  useTicker(250);
  const now = serverNow();
  const s = room.meta.settings;
  if (room.meta.status === 'paused') return <>Tạm dừng</>;
  if (round.phase === 'loading') return <>Đang chuẩn bị bài...</>;
  if (state.audioError) return <>{state.audioError}</>;
  if (now < round.stageStartAt) return <>Chuẩn bị nghe...</>;
  if (round.kind === 'sound') return <>Chạm một số để nghe, rồi chốt</>;
  if (now < round.stageStartAt + round.stages[round.stage] * 1000) return <>Đang phát...</>;
  const left = Math.max(0, Math.ceil((round.stageStartAt + stageWindowMs(round.stages[round.stage], s) - now) / 1000));
  return <>{round.stage >= round.stages.length - 1 ? `Hết giờ sau ${left} giây` : `Đoạn dài hơn sau ${left} giây`}</>;
}

/** Sound kind: a bar emptying over the listening window. */
function TimeLeft({ room, round }: { room: Room; round: RoundState }) {
  useTicker(250);
  const total = stageWindowMs(round.stages[0], room.meta.settings);
  const left = Math.max(0, round.stageStartAt + total - serverNow());
  return (
    <div class="timeleft">
      <span class="progress"><i style={{ width: Math.min(100, (left / total) * 100) + '%' }} /></span>
      <span class="num muted small">{Math.ceil(left / 1000)} giây</span>
    </div>
  );
}

/** Shared 3-2-1 before each clip: everyone hears it at the same server time. */
function Countdown({ round }: { round: RoundState }) {
  useTicker(100);
  const now = serverNow();
  const n = now < round.stageStartAt ? Math.ceil((round.stageStartAt - now) / 1000) : 0;
  const last = useRef(0);
  useEffect(() => {
    if (n > 0 && n !== last.current) sfx.tick();
    last.current = n;
  }, [n]);
  if (n <= 0 || n > 3) return null;
  return (
    <CountdownOverlay n={n} label={round.kind === 'sound' ? 'Chuẩn bị chọn nhạc' : `Đoạn ${round.stage + 1}: ${formatSeconds(round.stages[round.stage])}`} />
  );
}

function Reveal({ room, perms, session }: { room: Room; perms: Perms; session: RoomSession }) {
  useTicker(500);
  const round = room.round!;
  const opts = clampOpts(room.meta.opts);
  const song = room.playlist?.songs.find((s) => s.id === round.answer);
  const players = Object.entries(room.players ?? {}).map(([id, p]) => ({ ...p, id, score: p.score ?? 0 }));
  // The snapshot's scores may lag this round's increments; before + result is the floor.
  const after = players.map((p) => ({ ...p, score: Math.max(p.score, (round.scoresBefore?.[p.id] ?? 0) + (round.results?.[p.id]?.points ?? 0)) }));
  const deltas = rankChanges(after, round.scoresBefore ?? {});
  const total: Row[] = rankPlayers(after).map((p) => ({ id: p.id, name: p.name, rank: p.rank, value: p.score, delta: deltas[p.id], dim: !!p.eliminated }));
  const roundRows: Row[] = rankPlayers(
    Object.entries(round.results ?? {}).map(([id, r]) => ({ id, score: r.points, joinedAt: r.at, name: room.players?.[id]?.name ?? '?', stage: r.stage })),
  ).map((p) => ({ id: p.id, name: p.name, rank: p.rank, value: p.score, tag: round.kind === 'sound' ? undefined : `đoạn ${p.stage + 1}` }));
  const left = Math.max(0, Math.ceil(((round.revealUntil ?? 0) - serverNow()) / 1000));
  const out = round.eliminated ? room.players?.[round.eliminated]?.name : null;
  const mine = round.results?.[perms.pid];
  useEffect(() => void sfx.reveal(), []);
  return (
    <div class="reveal stack">
      <div class={'verdict ' + (mine ? 'ok' : 'bad')}>
        {mine ? <><IconCheck /> Bạn đoán đúng</> : <><IconX /> Lần này chưa được</>}
        <span class="num verdict-pts">+<CountUp value={mine?.points ?? 0} /></span>
      </div>
      <div class="reveal-main">
        <div class="reveal-cover">{song && <Cover song={song} q="lg" />}</div>
        <div class="reveal-text">
          <p class="kicker">Đáp án</p>
          <h2 class="reveal-title">{song?.title ?? '?'}</h2>
          <p class="reveal-artist">{song?.artist}</p>
        </div>
      </div>
      {out && <div class="verdict bad"><IconX /> {out} bị loại</div>}
      <section class="stack-xs">
        <h3 class="kicker">Vòng này</h3>
        {roundRows.length ? <RankList rows={roundRows} me={perms.pid} /> : <p class="muted">Không ai đoán đúng.</p>}
      </section>
      <section class="stack-xs">
        <h3 class="kicker">Tổng điểm</h3>
        <RankList rows={total} me={perms.pid} />
      </section>
      {room.meta.status === 'paused' ? <p class="status">Tạm dừng</p>
        : opts.flow === 'manual' ? (perms.isHost
          ? <button class="btn btn-primary btn-lg btn-block" onClick={() => session.hostNext()}>Bài tiếp <IconForward size={18} /></button>
          : <p class="status">Chờ chủ phòng chuyển bài...</p>)
        : <p class="status num">Bài tiếp sau {left} giây</p>}
    </div>
  );
}
