import { localEngine } from '../audio/local';
import { youtubeEngine } from '../audio/youtube';
import { pickNextHost } from '../core/match';
import { SOUND_PREVIEW_FRAC, SOUND_PREVIEW_SEC } from '../core/modes';
import { getSettings } from '../data/settings';
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
  /** The clip sounding now (drives the timeline), or null. */
  clip: { start: number; ms: number; key: number } | null;
  /** Sound kind: the numbered clip loading or playing on this device. */
  preview: { i: number; loading: boolean } | null;
  /** Sound kind: numbered clips loaded / total while the round loads. */
  loadProgress: [number, number] | null;
}

/** One joined room on this device: subscription, presence, host failover, audio sync. */
export class RoomSession {
  readonly pid = playerId();
  state: SessionState = { room: null, loaded: false, connected: true, kicked: false, audioReady: false, audioError: null, needTap: false, clip: null, preview: null, loadProgress: null };
  private listeners = new Set<() => void>();
  private unsubs: (() => void)[] = [];
  private host: HostController | null = null;
  private hostGoneSince = 0;
  private failoverTimer = 0;
  private preparedKey = '';
  private playedKey = '';
  private buffers: AudioBuffer[] = [];
  private previewSeq = 0;

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
    youtubeEngine().stopAll();
  }

  /** Players who already guessed right, were eliminated or sit out a sudden death only watch. */
  isSpectating(room = this.state.room): boolean {
    const round = room?.round;
    if (!room || !round) return false;
    if (round.results?.[this.pid] || room.players?.[this.pid]?.eliminated) return true;
    return !!round.suddenDeath && !(room.meta.suddenDeath ?? []).includes(this.pid);
  }

  /** Manual flow: "Bài tiếp" (runs only on the host's device). */
  hostNext(): void {
    void this.host?.next();
  }

  /** Spectators may mute the shared clips (friends in one room hear one phone). */
  setListening(on: boolean): void {
    if (!on) {
      youtubeEngine().stop();
      localEngine.stop();
      this.set({ clip: null });
    }
  }

  private shouldPlay(room: Room): boolean {
    return !this.isSpectating(room) || getSettings().listenSpectating;
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
    if (round.phase === 'playing' && this.state.audioReady && round.kind !== 'sound') {
      const pk = `${key}:${round.stage}:${round.stageStartAt}`;
      if (pk !== this.playedKey && serverNow() < round.stageStartAt + 1000) {
        this.playedKey = pk;
        if (this.shouldPlay(room)) void this.playStage(round, toPerf(round.stageStartAt));
        else {
          // Not listening: still run the timeline with everyone else.
          const ms = Math.round(round.stages[round.stage] * 1000);
          const at = toPerf(round.stageStartAt);
          this.set({ clip: { start: at, ms, key: at } });
        }
      }
    }
    if (round.phase === 'reveal' && this.state.preview) this.set({ preview: null });
  }

  private async prepare(round: RoundState, key: string): Promise<void> {
    try {
      if (round.kind === 'sound') {
        // Load the numbered clips before saying ready, so taps play at once (the host waits for everyone).
        const songs = (round.optionVideos ?? []).filter(Boolean).map((v) => ytSong(v, 0));
        this.set({ loadProgress: [0, songs.length] });
        await Promise.race([
          youtubeEngine().preloadSet(songs, { defaultOffsetMs: 0 }, { startFrac: SOUND_PREVIEW_FRAC, clipSec: SOUND_PREVIEW_SEC },
            (d, t) => key === this.preparedKey && this.set({ loadProgress: [d, t] })),
          new Promise((r) => setTimeout(r, 15000)),
        ]);
        this.set({ loadProgress: null });
      } else if (round.videoId) {
        const yt = youtubeEngine();
        if (yt.needsTapUnlock()) {
          this.set({ needTap: true });
          await yt.unlockWithTap(round.videoId);
          this.set({ needTap: false });
        }
        const opts = round.startFrac != null ? { startFrac: round.startFrac, clipSec: round.stages[round.stages.length - 1] } : {};
        await yt.prepare(ytSong(round.videoId, round.startMs ?? 0), { defaultOffsetMs: 0 }, opts);
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
    const onStart = (t: number) => this.set({ clip: { start: t, ms, key: t } });
    if (round.videoId) await youtubeEngine().playClip(ms, at, onStart);
    else if (this.buffers[round.stage]) await localEngine.playBuffer(this.buffers[round.stage], 0, ms, at, onStart);
  }

  /** Sound kind: plays numbered clip `i` on this device only. */
  async previewOption(round: RoundState, i: number): Promise<void> {
    const v = round.optionVideos?.[i];
    if (!v) return;
    const seq = ++this.previewSeq;
    const yt = youtubeEngine();
    const opts = { startFrac: SOUND_PREVIEW_FRAC, clipSec: SOUND_PREVIEW_SEC };
    yt.stop();
    this.set({ preview: { i, loading: true } });
    try {
      if (yt.needsTapUnlock()) {
        this.set({ needTap: true });
        await yt.unlockWithTap(v);
        this.set({ needTap: false });
      }
      await yt.prepare(ytSong(v, 0), { defaultOffsetMs: 0 }, opts);
      if (seq !== this.previewSeq) return;
      const ms = SOUND_PREVIEW_SEC * 1000;
      await yt.playClip(ms, undefined, (t) => seq === this.previewSeq && this.set({ preview: { i, loading: false }, clip: { start: t, ms, key: t } }));
      const nx = round.optionVideos?.[i + 1];
      if (nx && seq === this.previewSeq) yt.preload(ytSong(nx, 0), { defaultOffsetMs: 0 }, opts);
    } catch {
      /* unplayable clip: the button just stops spinning */
    } finally {
      if (seq === this.previewSeq) this.set({ preview: null });
    }
  }
}

const ytSong = (videoId: string, startMs: number): Song =>
  ({ id: videoId, title: '', artist: '', cover: '', source: { type: 'youtube', videoId }, startOffsetMs: startMs }) as Song;
