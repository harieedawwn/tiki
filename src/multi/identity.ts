import { DEFAULT_MATCH, clampSettings, type MatchSettings } from '../core/match';

const PID = 'tiki.pid', NAME = 'tiki.name', LOBBY = 'tiki.lobby', LAST_ROOM = 'tiki.lastRoom';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, v: string): void {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* ignore */
  }
}

let memPid: string | null = null;
/** Random player id, persisted so a dropped player rejoins as the same id. */
export function playerId(): string {
  let id = read(PID) ?? memPid;
  if (!id) {
    id = 'p' + [...crypto.getRandomValues(new Uint8Array(9))].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 14);
    write(PID, id);
    memPid = id;
  }
  return id;
}

export const playerName = () => read(NAME) ?? '';
export const setPlayerName = (n: string) => write(NAME, n.trim().slice(0, 24));

export function lobbyDefaults(): MatchSettings {
  try {
    return clampSettings({ ...DEFAULT_MATCH, ...JSON.parse(read(LOBBY) ?? '{}') });
  } catch {
    return DEFAULT_MATCH;
  }
}
export const saveLobbyDefaults = (s: MatchSettings) => write(LOBBY, JSON.stringify(s));

export const lastRoom = () => read(LAST_ROOM) ?? '';
export const setLastRoom = (code: string) => write(LAST_ROOM, code);
