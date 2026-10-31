import type { Playlist } from '../core/types';

const DB_NAME = 'tiki';
const STORE = 'playlists';
let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

const listeners = new Set<() => void>();
export const onPlaylistsChanged = (fn: () => void) => (listeners.add(fn), () => listeners.delete(fn));
const changed = () => listeners.forEach((f) => f());

export async function listPlaylists(): Promise<Playlist[]> {
  const all = await run<Playlist[]>('readonly', (s) => s.getAll());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export const getPlaylist = (id: string) => run<Playlist | undefined>('readonly', (s) => s.get(id));

export async function savePlaylist(p: Playlist): Promise<void> {
  await run('readwrite', (s) => s.put(p));
  changed();
}

export async function deletePlaylist(id: string): Promise<void> {
  await run('readwrite', (s) => s.delete(id));
  changed();
}

export async function resetAllData(): Promise<void> {
  const db = await open();
  db.close();
  dbp = null;
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
  localStorage.clear();
  changed();
}
