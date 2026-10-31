/*
 * Keys come from environment variables so they never land in the repo:
 * local dev reads `.env.local` (git-ignored); GitHub Actions reads repository secrets.
 * Browser keys still ship inside the built site, so restrict them by website in Google Cloud.
 */
const env = import.meta.env;

export const YOUTUBE_API_KEY: string = env.VITE_YOUTUBE_API_KEY ?? '';

/** SHA-256 hex of the developer code. The plaintext is never stored in the repo. */
export const DEV_CODE_SHA256 = 'd6d519590de145fac4c2ec581f41c7855e574fb86b98515f3db04aba051f2c2f';

export function hasYouTubeKey(): boolean {
  return YOUTUBE_API_KEY.length > 10 && !YOUTUBE_API_KEY.includes('<<');
}

/**
 * Firebase web config (Project settings > Your apps). databaseURL is required for Realtime Database.
 * Without it, `npm run dev` connects to the local Database emulator (127.0.0.1:9000).
 */
export const FIREBASE_CONFIG = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
  databaseURL: env.VITE_FIREBASE_DATABASE_URL ?? '',
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? '',
  appId: env.VITE_FIREBASE_APP_ID ?? '',
};

export const hasFirebaseConfig = () => !!FIREBASE_CONFIG.apiKey && !!FIREBASE_CONFIG.databaseURL;
export const useFirebaseEmulator = () => !hasFirebaseConfig() && import.meta.env.DEV;
export const multiplayerAvailable = () => hasFirebaseConfig() || useFirebaseEmulator();
