import { ref, update, increment } from 'firebase/database';
import { localEngine } from '../audio/local';
import { LEAD_MS, guessPoints, isElimRound, matchOutcome, pickEliminated, stageWindowMs, type Standing } from '../core/match';
import type { Song } from '../core/types';
import { getSettings } from '../data/settings';
import { cutClipWav } from './clips';
import { database, serverNow } from './firebase';
import type { HistoryEntry, Room, RoomPlayer, RoundState } from './types';

const REVEAL_MS = 6000;
const LOADING_TIMEOUT_MS = 20000;

type P = RoomPlayer & { id: string };
const playersOf = (r: Room): P[] => Object.entries(r.players ?? {}).map(([id, p]) => ({ ...p, id }));
const standing = (p: P): Standing => ({ id: p.id, score: p.score ?? 0, joinedAt: p.joinedAt ?? 0 });

/**
 * Runs the match for the room while this client is the host. Stateless between ticks: every decision
 * is derived from the database snapshot and server time, so a new host can take over mid-round.
 */
export class HostController {
  private room: Room | null = null;
  private timer = 0;
  private busy = false;
  private handledCmds = new Set<string>();

  constructor(private code: string, private pid: string) {}

  start(): void {
    this.timer = window.setInterval(() => this.tick(), 200);
  }

  stop(): void {
    clearInterval(this.timer);
  }

  setRoom(room: Room | null): void {
    this.room = room;
    void this.tick();
  }

  private write(patch: Record<string, unknown>) {
    return update(ref(database(), `rooms/${this.code}`), patch);
  }

  private async tick(): Promise<void> {
    if (this.busy || !this.room || this.room.meta?.hostId !== this.pid) return;
    this.busy = true;
    try {
      await this.step(this.room);
    } catch (e) {
      console.warn('host step failed', e);
    } finally {
      this.busy = false;
    }
  }

  /** Players who may guess this round. */
  private active(r: Room): P[] {
    const sd = r.round?.suddenDeath ? new Set(r.meta.suddenDeath ?? []) : null;
    return playersOf(r).filter((p) => !p.eliminated && (!sd || sd.has(p.id)));
  }

  private async step(r: Room): Promise<void> {
    if (await this.commands(r)) return;
    if (r.meta.status !== 'playing') return;
    const round = r.round;
    if (!round) return this.startRound(r, 0, null);
    const now = serverNow();
    const s = r.meta.settings;
    const activeOnline = this.active(r).filter((p) => p.connected);

    if (round.phase === 'loading') {
      const allReady = activeOnline.every((p) => round.ready?.[p.id] === round.index);
      if (allReady || now - round.loadingSince > LOADING_TIMEOUT_MS) {
        await this.write({ 'round/phase': 'playing', 'round/stage': 0, 'round/stageStartAt': now + LEAD_MS });
      }
      return;
    }

    if (round.phase === 'playing') {
      if (await this.processGuesses(r, round)) return;
      const results = round.results ?? {};
      const done = round.suddenDeath
        ? Object.keys(results).length > 0
        : activeOnline.length > 0 && activeOnline.every((p) => results[p.id]);
      const stageOver = now >= round.stageStartAt + stageWindowMs(round.stages[round.stage], s);
      if (done || (stageOver && round.stage >= round.stages.length - 1)) return this.reveal(r, round);
      if (stageOver) await this.write({ 'round/stage': round.stage + 1, 'round/stageStartAt': now + LEAD_MS });
      return;
    }

    if (round.phase === 'reveal' && now >= (round.revealUntil ?? 0)) await this.advance(r, round);
  }

  /** Returns true if it wrote something (the next snapshot continues). */
  private async commands(r: Room): Promise<boolean> {
    const entries = Object.entries(r.commands ?? {}).filter(([k]) => !this.handledCmds.has(k));
    if (!entries.length) return false;
    const [key, cmd] = entries[0];
    this.handledCmds.add(key);
    const isMod = cmd.by === r.meta.hostId || !!r.meta.mods?.[cmd.by];
    await this.write({ [`commands/${key}`]: null });
    if (!isMod) return true;
    const now = serverNow();
    const round = r.round;
    if (cmd.type === 'pause' && r.meta.status === 'playing') await this.write({ 'meta/status': 'paused', 'meta/pausedAt': now });
    if (cmd.type === 'resume' && r.meta.status === 'paused') {
      const patch: Record<string, unknown> = { 'meta/status': 'playing', 'meta/pausedAt': null };
      // Restart the current stage (or reveal countdown) after a pause.
      if (round?.phase === 'playing') patch['round/stageStartAt'] = now + LEAD_MS;
      if (round?.phase === 'reveal') patch['round/revealUntil'] = now + REVEAL_MS;
      if (round?.phase === 'loading') patch['round/loadingSince'] = now;
      await this.write(patch);
    }
    if (cmd.type === 'skip' && r.meta.status === 'playing' && round && round.phase !== 'reveal') await this.reveal(r, round);
    if (cmd.type === 'end' && (r.meta.status === 'playing' || r.meta.status === 'paused')) {
      const top = playersOf(r).filter((p) => !p.eliminated).sort((a, b) => b.score - a.score);
      await this.end(top.filter((p) => p.score === top[0]?.score).map((p) => p.id));
    }
    return true;
  }

  private async processGuesses(r: Room, round: RoundState): Promise<boolean> {
    const guesses = Object.entries(r.guesses?.[`r${round.index}`] ?? {}).sort(([a], [b]) => (a < b ? -1 : 1));
    const answer = r.playlist?.songs[r.hostState?.current ?? -1]?.id;
    if (!answer) return false;
    const allowed = new Set(this.active(r).map((p) => p.id));
    const results = { ...(round.results ?? {}) };
    const wrong = { ...(round.wrong ?? {}) };
    const patch: Record<string, unknown> = {};
    const cooldown = r.meta.settings.cooldownSec * 1000;
    for (const [key, g] of guesses) {
      patch[`guesses/r${round.index}/${key}`] = null;
      if (!allowed.has(g.pid) || results[g.pid] || typeof g.at !== 'number') continue;
      if (wrong[g.pid] && g.at - wrong[g.pid].at < cooldown) continue;
      if (g.songId === answer) {
        const elapsed = g.at - round.stageStartAt;
        const points = guessPoints(round.stage, elapsed, stageWindowMs(round.stages[round.stage], r.meta.settings), r.meta.settings.speedBonus);
        results[g.pid] = { points, stage: round.stage, at: g.at };
        patch[`round/results/${g.pid}`] = results[g.pid];
        patch[`players/${g.pid}/score`] = increment(points);
        if (round.suddenDeath) break;
      } else {
        wrong[g.pid] = { n: (wrong[g.pid]?.n ?? 0) + 1, at: g.at };
        patch[`round/wrong/${g.pid}`] = wrong[g.pid];
      }
    }
    if (!Object.keys(patch).length) return false;
    await this.write(patch);
    return true;
  }

  private async reveal(r: Room, round: RoundState): Promise<void> {
    const idx = r.hostState?.current ?? -1;
    const song = r.playlist?.songs[idx];
    const patch: Record<string, unknown> = {
      'round/phase': 'reveal', 'round/answer': song?.id ?? null, 'round/revealUntil': serverNow() + REVEAL_MS,
    };
    if (song) {
      const h: HistoryEntry = {
        index: round.index, songId: song.id, title: song.title, artist: song.artist, cover: song.cover,
        suddenDeath: !!round.suddenDeath, results: round.results ?? {},
      };
      patch[`history/r${String(round.index).padStart(2, '0')}`] = h;
    }
    if (!round.suddenDeath && isElimRound(r.meta.settings, round.index + 1)) {
      // Scores in the snapshot may lag this round's increments; add them back in.
      const act = this.active(r).map((p) => ({ ...standing(p), score: (round.scoresBefore?.[p.id] ?? 0) + (round.results?.[p.id]?.points ?? 0) }));
      const out = pickEliminated(act);
      if (out) {
        patch[`players/${out.id}/eliminated`] = true;
        patch['round/eliminated'] = out.id;
      }
    }
    await this.write(patch);
  }

  private async advance(r: Room, round: RoundState): Promise<void> {
    const hs = r.hostState ?? {};
    const songsLeft = (hs.queue?.length ?? 0) - (hs.pos ?? 0);
    const players = playersOf(r);
    if (round.suddenDeath) {
      const first = Object.entries(round.results ?? {}).sort((a, b) => a[1].at - b[1].at)[0];
      if (first) return this.end([first[0]]);
      const tied = r.meta.suddenDeath ?? [];
      return songsLeft > 0 ? this.startRound(r, round.index + 1, tied) : this.end(tied);
    }
    const active = players.filter((p) => !p.eliminated).map(standing);
    const regular = Object.keys(r.history ?? {}).filter((k) => !r.history![k].suddenDeath).length;
    const out = matchOutcome(r.meta.settings, regular, songsLeft, active);
    if (!out.end) return this.startRound(r, round.index + 1, null);
    if (out.leaders.length > 1 && songsLeft > 0) return this.startRound(r, round.index + 1, out.leaders);
    return this.end(out.leaders);
  }

  private end(winners: string[]) {
    return this.write({ 'meta/status': 'ended', 'meta/winners': winners, 'meta/suddenDeath': null });
  }

  private async startRound(r: Room, index: number, suddenDeath: string[] | null): Promise<void> {
    const hs = r.hostState ?? {};
    const queue = hs.queue ?? [];
    const stages = getSettings().presets[r.meta.settings.presetId].stages;
    let pos = hs.pos ?? 0;
    while (pos < queue.length) {
      const songIdx = queue[pos++];
      const src = hs.sources?.[songIdx];
      const song = r.playlist?.songs[songIdx];
      if (!src || !song) continue;
      const round: RoundState = {
        index, phase: 'loading', stage: 0, stages, stageStartAt: 0, loadingSince: serverNow(),
        suddenDeath: !!suddenDeath, answer: null,
        scoresBefore: Object.fromEntries(playersOf(r).map((p) => [p.id, p.score ?? 0])),
      };
      if (src.type === 'youtube') {
        round.videoId = src.videoId;
        round.startMs = src.startOffsetMs ?? hs.defaultOffsetMs ?? 0;
      } else {
        try {
          round.clips = await this.cutClips({ ...song, source: src, startOffsetMs: src.startOffsetMs }, stages, hs.defaultOffsetMs ?? 0);
        } catch {
          continue; // this host does not have the file: try the next song
        }
      }
      await this.write({
        round, 'hostState/pos': pos, 'hostState/current': songIdx, 'meta/suddenDeath': suddenDeath,
        [`guesses/r${index}`]: null,
      });
      return;
    }
    const top = playersOf(r).filter((p) => !p.eliminated).sort((a, b) => b.score - a.score);
    await this.end(suddenDeath ?? top.filter((p) => p.score === top[0]?.score).map((p) => p.id));
  }

  private async cutClips(song: Song, stages: number[], defaultOffsetMs: number): Promise<string[]> {
    const buf = await localEngine.decode(song);
    const startMs = song.startOffsetMs ?? localEngine.detect(buf) + defaultOffsetMs;
    return Promise.all(stages.map((sec) => cutClipWav(buf, startMs / 1000, sec)));
  }
}
