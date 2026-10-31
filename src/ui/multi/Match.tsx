import { useEffect, useMemo, useState } from 'preact/hooks';
import { rankChanges, rankPlayers, stageWindowMs } from '../../core/match';
import { formatSeconds } from '../../core/stages';
import type { Song } from '../../core/types';
import { serverNow } from '../../multi/firebase';
import { becomeHost, sendCommand, setLocked, submitGuess } from '../../multi/room';
import type { RoomSession, SessionState } from '../../multi/session';
import type { Room } from '../../multi/types';
import { ClipBar, Cover, StageIndicator } from '../components';
import { GuessSheet } from '../GuessSheet';
import { IconCheck, IconLock, IconPause, IconPlay, IconSearch, IconSkip, IconX } from '../icons';
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

export function Match({ code, room, session, state, perms }: {
  code: string; room: Room; session: RoomSession; state: SessionState; perms: Perms;
}) {
  useTicker(200);
  const round = room.round;
  const players = Object.entries(room.players ?? {}).map(([id, p]) => ({ ...p, id, score: p.score ?? 0 }));
  const ranked = rankPlayers(players);
  const me = ranked.find((p) => p.id === perms.pid);
  // The guess list carries no sources; a placeholder keeps the Song shape for GuessSheet.
  const songs = useMemo(() => (room.playlist?.songs ?? []).map((s) => ({ ...s, source: { type: 'youtube', videoId: '' }, startOffsetMs: null }) as Song), [room.playlist]);
  const [sheet, setSheet] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  // Local guess feedback: the host validates, so a guess is "pending" until it answers.
  const [pending, setPending] = useState<string | null>(null);
  const [wrongIds, setWrongIds] = useState<string[]>([]);
  const [wrongFlash, setWrongFlash] = useState(false);
  const myWrong = round?.wrong?.[perms.pid]?.n ?? 0;
  const roundIdx = round?.index;

  useEffect(() => {
    setWrongIds([]);
    setPending(null);
    setWrongFlash(false);
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
    const t = setTimeout(() => setWrongFlash(false), 2500);
    return () => clearTimeout(t);
  }, [myWrong]);

  if (!round || typeof round.index !== 'number') return <p class="status">Đang chuẩn bị vòng đầu...</p>;
  if (round.phase === 'reveal') return <Reveal room={room} perms={perms} />;

  const s = room.meta.settings;
  const roundLabel = round.suddenDeath ? 'Phân định' : `Vòng ${round.index + 1}/${s.rounds}`;
  const myResult = round.results?.[perms.pid];
  const eliminated = !!room.players?.[perms.pid]?.eliminated;
  const notInSudden = !!round.suddenDeath && !(room.meta.suddenDeath ?? []).includes(perms.pid);
  const spectator = eliminated || notInSudden;
  const cooldown = Math.max(0, cooldownUntil - Date.now());
  const now = serverNow();

  const correctNames = Object.keys(round.results ?? {}).map((id) => room.players?.[id]?.name).filter(Boolean);
  const top: Row[] = ranked.slice(0, 3).map((p) => ({ id: p.id, name: p.name, rank: p.rank, value: p.score, tag: round.results?.[p.id] ? 'đúng' : undefined, dim: !!p.eliminated }));
  if (me && !top.some((r) => r.id === me.id)) top.push({ id: me.id, name: me.name, rank: me.rank, value: me.score, tag: round.results?.[me.id] ? 'đúng' : undefined });

  let status: string;
  if (room.meta.status === 'paused') status = 'Tạm dừng';
  else if (round.phase === 'loading') status = state.needTap ? 'Chạm vào video để bật âm thanh' : 'Đang chuẩn bị bài...';
  else if (state.audioError) status = state.audioError;
  else if (now < round.stageStartAt) status = 'Chuẩn bị nghe...';
  else if (now < round.stageStartAt + round.stages[round.stage] * 1000) status = 'Đang phát...';
  else status = round.stage >= round.stages.length - 1
    ? `Hết giờ sau ${Math.max(0, Math.ceil((round.stageStartAt + stageWindowMs(round.stages[round.stage], s) - now) / 1000))} giây`
    : `Đoạn dài hơn sau ${Math.max(0, Math.ceil((round.stageStartAt + stageWindowMs(round.stages[round.stage], s) - now) / 1000))} giây`;
  // Shared 3-2-1 before each clip: everyone hears it at the same server time.
  const countdown = round.phase === 'playing' && room.meta.status === 'playing' && now < round.stageStartAt ? Math.ceil((round.stageStartAt - now) / 1000) : 0;

  const canGuess = round.phase === 'playing' && !myResult && !spectator && room.meta.status === 'playing';
  return (
    <div class="game">
      <div class="game-top">
        <div class="game-progress num">{roundLabel}</div>
        <div class="game-score">
          <span class="num score">{(me?.score ?? 0).toLocaleString('vi-VN')}</span>
          {me && <span class="streak on num">#{me.rank}</span>}
        </div>
      </div>

      <div class="card clip-card">
        <div class="clip-head">
          <span class="kicker num">Đoạn {round.stage + 1}/{round.stages.length}</span>
          <span class="clip-len num">{formatSeconds(round.stages[round.stage])}</span>
        </div>
        <ClipBar seed={`${code}:${round.index}`} stages={round.stages} stage={round.stage} pulse={round.stageStartAt} />
        <StageIndicator stages={round.stages} stage={round.stage} />
      </div>

      <p class="status" role="status">
        {myResult ? <>Bạn đã đoán đúng! <b class="num">+{myResult.points}</b></>
          : spectator ? (eliminated ? 'Bạn đã bị loại, đang xem.' : 'Đang phân định giữa những người bằng điểm.')
          : pending ? 'Đang kiểm tra...'
          : wrongFlash ? (cooldown > 0 ? `Chưa đúng. Đoán lại sau ${Math.ceil(cooldown / 1000)} giây.` : 'Chưa đúng. Đoán lại đi.')
          : status}
      </p>

      <div class="row">
        <button class="btn grow" disabled={!state.audioReady || round.phase !== 'playing'} onClick={() => session.playStage(round)}>
          <IconPlay size={18} /> Nghe lại
        </button>
        <button class="btn btn-primary grow" disabled={!canGuess} onClick={() => setSheet(true)}>
          <IconSearch size={18} /> Đoán
        </button>
      </div>

      <section class="stack-xs">
        <h3 class="kicker">Bảng xếp hạng</h3>
        <RankList rows={top} me={perms.pid} ellipsis />
        {correctNames.length > 0 && <p class="hint"><IconCheck size={14} /> Đã đoán đúng: {correctNames.join(', ')}</p>}
      </section>

      {sheet && (
        <GuessSheet songs={songs} wrong={wrongIds} disabled={!canGuess || cooldown > 0 || !!pending} disabledLabel={cooldown > 0 ? `Chờ ${Math.ceil(cooldown / 1000)} giây` : undefined}
          onSubmit={(id) => {
            setPending(id);
            void submitGuess(code, round.index, id).catch(() => setPending(null));
            setSheet(false);
          }}
          onClose={() => setSheet(false)} />
      )}
      {countdown > 0 && !sheet && (
        <div class="countdown" aria-live="assertive"><span class="num">{countdown}</span><small>Đoạn {round.stage + 1}: {formatSeconds(round.stages[round.stage])}</small></div>
      )}
      {state.needTap && <div class="unlock-label">Chạm để bật âm thanh</div>}
    </div>
  );
}

function Reveal({ room, perms }: { room: Room; perms: Perms }) {
  const round = room.round!;
  const song = room.playlist?.songs.find((s) => s.id === round.answer);
  const players = Object.entries(room.players ?? {}).map(([id, p]) => ({ ...p, id, score: p.score ?? 0 }));
  // The snapshot's scores may lag this round's increments; before + result is the floor.
  const after = players.map((p) => ({ ...p, score: Math.max(p.score, (round.scoresBefore?.[p.id] ?? 0) + (round.results?.[p.id]?.points ?? 0)) }));
  const deltas = rankChanges(after, round.scoresBefore ?? {});
  const total: Row[] = rankPlayers(after).map((p) => ({ id: p.id, name: p.name, rank: p.rank, value: p.score, delta: deltas[p.id], dim: !!p.eliminated }));
  const roundRows: Row[] = rankPlayers(
    Object.entries(round.results ?? {}).map(([id, r]) => ({ id, score: r.points, joinedAt: r.at, name: room.players?.[id]?.name ?? '?', stage: r.stage })),
  ).map((p) => ({ id: p.id, name: p.name, rank: p.rank, value: p.score, tag: `đoạn ${p.stage + 1}` }));
  const left = Math.max(0, Math.ceil(((round.revealUntil ?? 0) - serverNow()) / 1000));
  const out = round.eliminated ? room.players?.[round.eliminated]?.name : null;
  return (
    <div class="reveal stack">
      <div class="row reveal-head">
        <div class="reveal-cover reveal-cover-sm">{song && <Cover song={song} />}</div>
        <div class="grow">
          <p class="kicker">Đáp án</p>
          <h2 class="display display-sm reveal-title">{song?.title ?? '?'}</h2>
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
      <p class="status num">{room.meta.status === 'paused' ? 'Tạm dừng' : `Bài tiếp sau ${left} giây`}</p>
    </div>
  );
}
