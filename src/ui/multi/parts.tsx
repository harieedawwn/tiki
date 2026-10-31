import { useEffect, useState } from 'preact/hooks';
import type { Room } from '../../multi/types';
import { kickPlayer, renamePlayer, setMod, setScore } from '../../multi/room';
import { Sheet } from '../components';
import { IconDown, IconMore, IconUp } from '../icons';

export interface Perms {
  pid: string;
  isHost: boolean;
  isMod: boolean;
  isDev: boolean;
}

export function permsFor(room: Room, pid: string, isDev: boolean): Perms {
  const isHost = room.meta.hostId === pid;
  return { pid, isHost, isMod: isHost || !!room.meta.mods?.[pid], isDev };
}

/** Re-renders every `ms` (countdowns). */
export function useTicker(ms = 250): number {
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
  return t;
}

export function RankDelta({ d }: { d: number }) {
  if (!d) return <span class="delta same" aria-label="Giữ hạng">=</span>;
  return d > 0
    ? <span class="delta up" aria-label={`Lên ${d} hạng`}><IconUp size={14} />{d}</span>
    : <span class="delta down" aria-label={`Xuống ${-d} hạng`}><IconDown size={14} />{-d}</span>;
}

export interface Row {
  id: string;
  name: string;
  rank: number;
  value: number;
  delta?: number;
  tag?: string;
  dim?: boolean;
}

export function RankList({ rows, me, ellipsis }: { rows: Row[]; me: string; ellipsis?: boolean }) {
  return (
    <ol class="ranklist">
      {rows.map((r, i) => (
        <li key={r.id} class={(r.id === me ? 'me ' : '') + (r.dim ? 'dim' : '') + (ellipsis && i === rows.length - 1 && i > 0 && rows[i - 1].rank < r.rank - 1 ? ' gap' : '')}>
          <span class="rank num">{r.rank}</span>
          <span class="rank-name">{r.name}{r.tag && <em class="tag">{r.tag}</em>}</span>
          {r.delta !== undefined && <RankDelta d={r.delta} />}
          <span class="rank-val num">{r.value.toLocaleString('vi-VN')}</span>
        </li>
      ))}
    </ol>
  );
}

/** Player row menu: actions depend on the viewer's role (host/mod: kick; dev: mod, rename, score). */
export function PlayerMenu({ code, room, target, perms }: { code: string; room: Room; target: string; perms: Perms }) {
  const [open, setOpen] = useState(false);
  const p = room.players?.[target];
  const [name, setName] = useState(p?.name ?? '');
  const [score, setScoreVal] = useState(String(p?.score ?? 0));
  if (!p) return null;
  const canKick = perms.isMod && target !== perms.pid && target !== room.meta.hostId;
  if (!canKick && !perms.isDev) return null;
  const isMod = !!room.meta.mods?.[target];
  const run = (fn: () => Promise<unknown>) => () => void fn().finally(() => setOpen(false));
  return (
    <>
      <button class="icon-btn icon-btn-sm" aria-label={`Tuỳ chọn cho ${p.name}`} onClick={() => setOpen(true)}><IconMore size={20} /></button>
      {open && (
        <Sheet title={p.name} onClose={() => setOpen(false)}>
          {canKick && <button class="btn btn-danger btn-block" onClick={run(() => kickPlayer(code, target))}>Mời ra khỏi phòng</button>}
          {perms.isDev && (
            <>
              <button class="btn btn-block" onClick={run(() => setMod(code, target, !isMod))}>{isMod ? 'Thu hồi quyền điều hành' : 'Cấp quyền điều hành'}</button>
              <form class="row" onSubmit={(e) => (e.preventDefault(), run(() => renamePlayer(code, target, name))())}>
                <input class="input grow" value={name} maxLength={24} aria-label="Tên mới" onInput={(e) => setName(e.currentTarget.value)} />
                <button class="btn" type="submit" disabled={!name.trim()}>Đổi tên</button>
              </form>
              <form class="row" onSubmit={(e) => (e.preventDefault(), run(() => setScore(code, target, Number(score) || 0))())}>
                <input class="input grow num" type="number" value={score} aria-label="Điểm" onInput={(e) => setScoreVal(e.currentTarget.value)} />
                <button class="btn" type="submit">Sửa điểm</button>
              </form>
            </>
          )}
          <button class="btn btn-block" onClick={() => setOpen(false)}>Đóng</button>
        </Sheet>
      )}
    </>
  );
}
