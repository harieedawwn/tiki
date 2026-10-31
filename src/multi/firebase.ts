import { initializeApp } from 'firebase/app';
import { connectDatabaseEmulator, getDatabase, onValue, ref, type Database } from 'firebase/database';
import { FIREBASE_CONFIG, useFirebaseEmulator } from '../config';

let db: Database | null = null;
let offset = 0;
let connected = true;
const listeners = new Set<() => void>();

/** Lazily initialised Realtime Database (modular SDK, database module only). */
export function database(): Database {
  if (db) return db;
  const emu = useFirebaseEmulator();
  const app = initializeApp(
    emu ? { projectId: 'demo-tichtac', databaseURL: 'http://127.0.0.1:9000?ns=demo-tichtac' } : FIREBASE_CONFIG,
  );
  db = getDatabase(app);
  if (emu) connectDatabaseEmulator(db, '127.0.0.1', 9000);
  onValue(ref(db, '.info/serverTimeOffset'), (s) => (offset = Number(s.val()) || 0));
  let first = true;
  onValue(ref(db, '.info/connected'), (s) => {
    // .info/connected starts false before the first connection; do not flag that as a drop.
    if (first && !s.val()) return;
    first = false;
    connected = !!s.val();
    listeners.forEach((f) => f());
  });
  return db;
}

/** Estimated server time in ms (Date.now() + .info/serverTimeOffset). */
export const serverNow = () => Date.now() + offset;
/** Converts a server timestamp to a performance.now() timestamp. */
export const toPerf = (serverMs: number) => performance.now() + (serverMs - serverNow());

export const isConnected = () => connected;
export const subscribeConnection = (fn: () => void) => (listeners.add(fn), () => listeners.delete(fn));
