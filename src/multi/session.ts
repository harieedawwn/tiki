import { localEngine } from '../audio/local';
import { youtubeEngine } from '../audio/youtube';
import { pickNextHost } from '../core/match';
import type { Song } from '../core/types';
import { fromBase64 } from './clips';
import { isConnected, serverNow, subscribeConnection, toPerf } from './firebase';
import { HostController } from './host';
import { playerId } from './identity';
import { claimHost, keepPresence, markReady, subscribeRoom } from './room';
import type { Room, RoundState } from './types';

const HOST_GRACE_MS = 5000;

export interface SessionState {
  room: Room | null;
  loaded: boolean;
  connected: boolean;
  kicked: boolean;
  /** Audio for the current round is ready on this device. */
  audioReady: boolean;
  audioError: string | null;
  needTap: boolean;
}

/** One joined room on this device: subscription, presence, host failover, audio sync. */
export class RoomSession {
  readonly pid = playerId();
  state: SessionState = { room: null, loaded: false, connected: true, kicked: false, audioReady: false, audioError: null, needTap: false };
  private listeners = new Set<() => void>();
  private unsubs: (() => void)[] = [];
  private host: HostController | null = null;
  private hostGoneSince = 0;
  private failoverTimer = 0;
  private preparedKey = '';
  private playedKey = '';
  private buffers: AudioBuffer[] = [];

  constructor(readonly code: string) {}

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<SessionState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((f) => f());
  }

  start(): void {
    this.unsubs.push(subscribeRoom(this.code, (room) => this.onRoom(room)));
    this.unsubs.push(keepPresence(this.code));
    this.unsubs.push(subscribeConnection(() => this.set({ connected: isConnected() })));
    this.failoverTimer = window.setInterval(() => this.checkHost(), 1000);
  }

  stop(): void {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    clearInterval(this.failoverTimer);
    this.host?.stop();
    this.host = null;
    localEngine.stop();
    youtubeEngine().stop();
  }

  private onRoom(room: Room | null): void {
    const kicked = !!room?.meta?.kicked?.[this.pid];
    this.set({ room, loaded: true, kicked });
    if (!room?.meta || kicked) {
      this.host?.stop();
      this.host = null;
      return;
    }
    // Run the host loop whenever this device holds the host role.
    if (room.meta.hostId === this.pid && !this.host) {
      this.host = new HostController(this.code, this.pid);
      this.host.start();
    } else if (room.meta.hostId !== this.pid && this.host) {
      this.host.stop();
      this.host = null;
    }
    this.host?.setRoom(room);
    this.syncAudio(room);
  }

  /** If the host has been disconnected for more than 5 s, the earliest-joined connected player takes over. */
  private checkHost(): void {
    const room = this.state.room;
    if (!room?.meta || !this.state.connected) return;
    const hostId = room.meta.hostId;
    const host = room.players?.[hostId];
    if (host?.connected) {
      this.hostGoneSince = 0;
      return;
    }
    this.hostGoneSince ||= Date.now();
    if (Date.now() - this.hostGoneSince < HOST_GRACE_MS) return;
    const players = Object.entries(room.players ?? {}).map(([id, p]) => ({ id, score: p.score, joinedAt: p.joinedAt, connected: p.connected }));
    if (pickNextHost(players)?.id === this.pid) {
      this.hostGoneSince = 0;
      void claimHost(this.code, hostId);
    }
  }

  private syncAudio(room: Room): void {
    const round = room.round;
    if (room.meta.status !== 'playing' || !round || typeof round.index !== 'number') return;
    const key = `${round.index}:${round.videoId ?? 'clip'}:${round.loadingSince}`;
    if (key !== this.preparedKey) {
      this.preparedKey = key;
      this.playedKey = '';
      this.set({ audioReady: false, audioError: null });
      void this.prepare(round, key);
    }
    if (round.phase === 'playing' && this.state.audioReady) {
      const pk = `${key}:${round.stage}:${round.stageStartAt}`;
      if (pk !== this.playedKey && serverNow() < round.stageStartAt + 1000) {
        this.playedKey = pk;
        void this.playStage(round, toPerf(round.stageStartAt));
      }
    }
  }

  private async prepare(round: RoundState, key: string): Promise<void> {
    try {
      if (round.videoId) {
        const yt = youtubeEngine();
        const song = { id: round.videoId, title: '', artist: '', cover: '', source: { type: 'youtube', videoId: round.videoId }, startOffsetMs: round.startMs ?? 0 } as Song;
        if (yt.needsTapUnlock()) {
          this.set({ needTap: true });
          await yt.unlockWithTap(round.videoId);
          this.set({ needTap: false });
        }
        await yt.prepare(song, { defaultOffsetMs: 0 });
      } else if (round.clips) {
        const ctx = localEngine.context();
        this.buffers = await Promise.all(round.clips.map((b64) => ctx.decodeAudioData(fromBase64(b64))));
      }
      if (key !== this.preparedKey) return;
      this.set({ audioReady: true });
    } catch {
      if (key !== this.preparedKey) return;
      this.set({ audioError: 'Không phát được bài này trên máy bạn.' });
    }
    await markReady(this.code, round.index).catch(() => {});
    if (this.state.room) this.syncAudio(this.state.room);
  }

  /** Plays the current stage at `at` (performance.now()), or now for a local replay. */
  async playStage(round: RoundState, at?: number): Promise<void> {
    const ms = Math.round(round.stages[round.stage] * 1000);
    if (round.videoId) await youtubeEngine().playClip(ms, at);
    else if (this.buffers[round.stage]) await localEngine.playBuffer(this.buffers[round.stage], 0, ms, at);
  }
}
