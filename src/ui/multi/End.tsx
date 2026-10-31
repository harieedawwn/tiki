import { rankPlayers } from '../../core/match';
import { backToLobby } from '../../multi/room';
import type { Room } from '../../multi/types';
import { Cover } from '../components';
import { RankList, type Perms } from './parts';

export function End({ code, room, perms }: { code: string; room: Room; perms: Perms }) {
  const ranked = rankPlayers(Object.entries(room.players ?? {}).map(([id, p]) => ({ ...p, id, score: p.score ?? 0 })));
  const winners = (room.meta.winners ?? []).map((id) => room.players?.[id]?.name).filter(Boolean);
  const podium = ranked.slice(0, 3);
  const order = [podium[1], podium[0], podium[2]];
  const history = Object.values(room.history ?? {}).sort((a, b) => a.index - b.index);
  return (
    <div class="stack">
      <div>
        <p class="kicker">Kết thúc trận</p>
        <h1 class="display display-sm">{winners.length > 1 ? `Đồng hạng: ${winners.join(', ')}` : winners.length ? `${winners[0]} thắng!` : 'Hết trận'}</h1>
      </div>
      <div class="podium" aria-label="Bục vinh quang">
        {order.map((p, i) => p && (
          <div key={p.id} class={`podium-col p${[2, 1, 3][i]}`}>
            <span class="podium-name">{p.name}</span>
            <span class="podium-score num">{p.score.toLocaleString('vi-VN')}</span>
            <div class="podium-block num">{p.rank}</div>
          </div>
        ))}
      </div>
      <section class="stack-xs">
        <h3 class="kicker">Bảng điểm</h3>
        <RankList rows={ranked.map((p) => ({ id: p.id, name: p.name, rank: p.rank, value: p.score, tag: p.eliminated ? 'bị loại' : undefined }))} me={perms.pid} />
      </section>
      <section class="stack-xs">
        <h3 class="kicker">Từng vòng</h3>
        <ol class="result-list">
          {history.map((h) => {
            const got = Object.entries(h.results ?? {}).sort((a, b) => b[1].points - a[1].points);
            return (
              <li key={h.index}>
                <span class="track-no num">{h.suddenDeath ? 'PĐ' : String(h.index + 1).padStart(2, '0')}</span>
                <Cover song={h} size={48} />
                <span class="track-main">
                  <span class="track-name">{h.title}</span>
                  <span class="track-meta">
                    {got.length ? got.map(([id, r]) => `${room.players?.[id]?.name ?? '?'} +${r.points}`).join(', ') : 'Không ai đoán đúng'}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      </section>
      {perms.isHost ? (
        <button class="btn btn-primary btn-xl btn-block" onClick={() => backToLobby(code, room)}>Chơi lại</button>
      ) : (
        <p class="status">Chờ chủ phòng bấm Chơi lại...</p>
      )}
    </div>
  );
}
