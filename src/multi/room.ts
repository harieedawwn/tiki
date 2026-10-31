import {
  equalTo, get, increment, onDisconnect, onValue, orderByChild, push, query, ref, remove, runTransaction,
  serverTimestamp, set, update,
} from 'firebase/database';
import { shuffle } from '../core/game';
import { LEAD_MS, MAX_PLAYERS, ROOM_CODE_RE, clampOpts, clampSettings, makeRoomCode, type MatchSettings, type RoomOpts } from '../core/match';
import type { Playlist } from '../core/types';
import { shrinkCover } from './clips';
import { database, serverNow } from './firebase';
import { lobbyDefaults, lobbyOpts, playerId, setLastRoom } from './identity';
import type { CommandType, FeaturedPlaylist, HostState, Room, RoomPlaylist } from './types';

export class RoomError extends Error {}

const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
const rref = (code: string, path = '') => ref(database(), `rooms/${code}${path ? '/' + path : ''}`);

/** Deletes rooms this player hosts that are older than 6 h. */
async function cleanupOwnRooms(pid: string): Promise<void> {
  try {
    const snap = await get(query(ref(database(), 'rooms'), orderByChild('meta/hostId'), equalTo(pid)));
    const old: Record<string, null> = {};
    snap.forEach((c) => {
      if ((c.child('meta/createdAt').val() ?? 0) < serverNow() - ROOM_TTL_MS) old[`rooms/${c.key}`] = null;
    });
    if (Object.keys(old).length) await update(ref(database()), old);
  } catch {
    /* best effort */
  }
}

export async function createRoom(name: string): Promise<string> {
  const pid = playerId();
  await cleanupOwnRooms(pid);
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = makeRoomCode();
    const res = await runTransaction(rref(code, 'meta'), (cur) =>
      cur ? undefined : { hostId: pid, locked: false, status: 'lobby', createdAt: serverNow(), settings: lobbyDefaults(), opts: lobbyOpts() },
    );
    if (!res.committed) continue;
    await set(rref(code, `players/${pid}`), { name, score: 0, connected: true, joinedAt: serverNow() });
    setLastRoom(code);
    return code;
  }
  throw new RoomError('Không tạo được phòng, thử lại.');
}

export async function joinRoom(code: string, name: string): Promise<void> {
  if (!ROOM_CODE_RE.test(code)) throw new RoomError('Mã phòng gồm 5 ký tự.');
  const pid = playerId();
  const snap = await get(rref(code));
  const room = snap.val() as Room | null;
  if (!room?.meta) throw new RoomError('Không tìm thấy phòng ' + code + '.');
  if (room.meta.kicked?.[pid]) throw new RoomError('Bạn đã được mời ra khỏi phòng');
  const me = room.players?.[pid];
  if (!me && room.meta.locked) throw new RoomError('Phòng đã khoá.');
  if (!me && Object.keys(room.players ?? {}).length >= MAX_PLAYERS) throw new RoomError(`Phòng đã đủ ${MAX_PLAYERS} người.`);
  await update(rref(code, `players/${pid}`), {
    name, score: me?.score ?? 0, connected: true, joinedAt: me?.joinedAt ?? serverNow(),
  });
  setLastRoom(code);
}

/** Presence: marks the player connected on every (re)connection, disconnected via onDisconnect. */
export function keepPresence(code: string): () => void {
  const pid = playerId();
  const connRef = rref(code, `players/${pid}/connected`);
  return onValue(ref(database(), '.info/connected'), async (s) => {
    if (!s.val()) return;
    await onDisconnect(connRef).set(false);
    const exists = await get(rref(code, `players/${pid}/name`));
    if (exists.exists()) await set(connRef, true);
  });
}

export async function leaveRoom(code: string, inLobby: boolean): Promise<void> {
  const pid = playerId();
  const connRef = rref(code, `players/${pid}/connected`);
  await onDisconnect(connRef).cancel();
  if (inLobby) await remove(rref(code, `players/${pid}`));
  else await set(connRef, false);
}

export const subscribeRoom = (code: string, cb: (room: Room | null) => void) =>
  onValue(rref(code), (s) => cb(s.val() as Room | null), () => cb(null));

/** Host: copies a playlist into the room (covers shrunk for local songs) and keeps sources in hostState. */
export async function setRoomPlaylist(code: string, p: Playlist): Promise<void> {
  const songs = await Promise.all(
    p.songs.map(async (s) => ({ id: s.id, title: s.title, artist: s.artist, cover: p.kind === 'local' ? await shrinkCover(s.cover) : s.cover })),
  );
  const playlist: RoomPlaylist = { id: p.id, name: p.name, kind: p.kind, songs };
  const hostState: HostState = {
    sources: p.songs.map((s) => ({ ...s.source, startOffsetMs: s.startOffsetMs })),
    defaultOffsetMs: p.defaultOffsetMs,
  };
  await update(rref(code), { playlist, hostState });
}

export async function setRoomSettings(code: string, s: MatchSettings): Promise<void> {
  await set(rref(code, 'meta/settings'), clampSettings(s));
}

export async function setRoomOpts(code: string, o: RoomOpts): Promise<void> {
  await set(rref(code, 'meta/opts'), clampOpts(o));
}

export const roomOpts = (room: Room) => clampOpts(room.meta.opts);

/** Manual flow: the host starts the loaded round (everyone hears it after the shared countdown). */
export const startRoundNow = (code: string) =>
  update(rref(code), { 'round/phase': 'playing', 'round/stage': 0, 'round/stageStartAt': serverNow() + LEAD_MS });

/** Host: resets scores and starts the match; the host loop then starts round 0. */
export async function startMatch(code: string, room: Room): Promise<void> {
  const n = room.playlist?.songs.length ?? 0;
  if (!n) throw new RoomError('Chọn danh sách bài hát trước.');
  const o = roomOpts(room);
  if (o.kind === 'sound' && room.playlist?.kind !== 'youtube') throw new RoomError('Chế độ Xem ảnh, chọn nhạc chỉ dùng được với playlist YouTube.');
  if (o.kind === 'cover' && (room.playlist?.songs.filter((s) => s.cover).length ?? 0) < 4) throw new RoomError('Cần ít nhất 4 bài có ảnh bìa.');
  const patch: Record<string, unknown> = {
    'meta/status': 'playing', 'meta/winners': null, 'meta/suddenDeath': null, 'meta/pausedAt': null,
    round: null, history: null, guesses: null, commands: null,
    'hostState/queue': shuffle([...Array(n).keys()]), 'hostState/pos': 0, 'hostState/current': null,
  };
  for (const pid of Object.keys(room.players ?? {})) {
    patch[`players/${pid}/score`] = 0;
    patch[`players/${pid}/eliminated`] = null;
  }
  await update(rref(code), patch);
}

/** "Chơi lại": everyone back to the lobby with the same players and settings. */
export async function backToLobby(code: string, room: Room): Promise<void> {
  const patch: Record<string, unknown> = {
    'meta/status': 'lobby', 'meta/winners': null, 'meta/suddenDeath': null,
    round: null, history: null, guesses: null, commands: null, 'hostState/queue': null, 'hostState/current': null,
  };
  for (const pid of Object.keys(room.players ?? {})) {
    patch[`players/${pid}/score`] = 0;
    patch[`players/${pid}/eliminated`] = null;
  }
  await update(rref(code), patch);
}

export async function submitGuess(code: string, roundIndex: number, songId: string): Promise<void> {
  await push(rref(code, `guesses/r${roundIndex}`), { pid: playerId(), songId, at: serverTimestamp() });
}

/** Ready flag holds the round index, so a late write never counts for a newer round. */
export const markReady = (code: string, roundIndex: number) => set(rref(code, `round/ready/${playerId()}`), roundIndex);

export const sendCommand = (code: string, type: CommandType) => push(rref(code, 'commands'), { type, by: playerId() });

// Moderation (host/mods; dev for the extra ones). Permissions are enforced client-side only.
export const kickPlayer = (code: string, pid: string) => update(rref(code), { [`meta/kicked/${pid}`]: true, [`players/${pid}`]: null });
export const setLocked = (code: string, locked: boolean) => set(rref(code, 'meta/locked'), locked);
export const setMod = (code: string, pid: string, on: boolean) => set(rref(code, `meta/mods/${pid}`), on ? true : null);
export const renamePlayer = (code: string, pid: string, name: string) => set(rref(code, `players/${pid}/name`), name.trim().slice(0, 24));
export const setScore = (code: string, pid: string, score: number) => set(rref(code, `players/${pid}/score`), Math.round(score));
export const addScore = (code: string, pid: string, delta: number) => set(rref(code, `players/${pid}/score`), increment(delta));
export const becomeHost = (code: string) => set(rref(code, 'meta/hostId'), playerId());
export const deleteRoom = (code: string) => remove(rref(code));
export const getRoomOnce = async (code: string) => (await get(rref(code))).val() as Room | null;

/** Host failover: claim the host role only if it is still held by `oldHost`. */
export const claimHost = (code: string, oldHost: string) =>
  runTransaction(rref(code, 'meta/hostId'), (cur) => (cur === oldHost ? playerId() : undefined));

// Featured playlists ("Playlist đề xuất")
const featKey = (id: string) => id.replace(/[.#$\[\]\/]/g, '_');

export async function publishFeatured(p: Playlist): Promise<void> {
  const songs = await Promise.all(p.songs.map(async (s) => ({ ...s, cover: p.kind === 'local' ? await shrinkCover(s.cover) : s.cover })));
  const f: FeaturedPlaylist = { id: p.id, name: p.name, kind: p.kind, songs, defaultOffsetMs: p.defaultOffsetMs, publishedAt: serverNow() };
  await set(ref(database(), `featured/${featKey(p.id)}`), JSON.parse(JSON.stringify(f)));
}
export const unpublishFeatured = (id: string) => remove(ref(database(), `featured/${featKey(id)}`));
export const subscribeFeatured = (cb: (list: FeaturedPlaylist[]) => void) =>
  onValue(ref(database(), 'featured'), (s) => {
    const v = (s.val() ?? {}) as Record<string, FeaturedPlaylist>;
    cb(Object.values(v).sort((a, b) => b.publishedAt - a.publishedAt));
  }, () => cb([]));
