# Tiki: spec

Mobile-first song-guessing PWA. Hear 0.5-12 s from the start of a song and name it. Vietnamese UI.

## Architecture
- `src/core`: pure logic, no DOM. `game.ts` (state transitions), `scoring.ts`, `stages.ts` (presets), `text.ts` (normalize, search, name cleanup), `playlistLink.ts`.
- `src/audio`: `engine.ts` (AudioEngine interface), `youtube.ts` (single IFrame player), `local.ts` (Web Audio), `silence.ts` (start detection, peaks), `debug.ts` (overlay store).
- `src/data`: `db.ts` (IndexedDB, one `playlists` store), `settings.ts` (localStorage), `youtubeApi.ts`, `localImport.ts`.
- `src/ui`: Preact screens (`Home`, `Setup`, `Game` incl. reveal and end, `Settings`), `GuessSheet`, `dev/*`, `multi/*` (lazy chunk).
- `src/core/match.ts`: pure multiplayer rules (room code, ranking, rank change, elimination, outcome, next host).
- `src/multi`: `firebase.ts` (lazy RTDB init, server time), `room.ts` (writes, moderation, featured), `host.ts` (host loop), `session.ts` (presence, failover, audio sync), `clips.ts` (WAV clips, covers).

## Game kinds (src/core/modes.ts)
- classic: opening clip, guess by name (search). random: same, from a random start (`startFrac` resolved against the song length with `startFromFrac`). cover: classic clip, guess by picking one of N covers (12/20/40). sound: the cover is shown, N numbered 4 s clips from 30% into each song (4/6/10/20), 3 attempts (1000/500/250).
- Multiplayer: `meta/opts` = { kind, choices, flow: auto|manual, revealSec }. The host writes `round.kind`, `round.startFrac`, `round.options` (song indexes), and for sound `round.optionVideos` + `round.cover` (the question; answer stays out of `round`). Sound kind is YouTube-only and has one 25 s window; clients play clips on their own.
- Spectating: after a correct guess (or when eliminated) a player only watches; they may mute the shared clips (`settings.listenSpectating`), the timeline keeps running.

## Vote skip and stickers (rooms)
- `round/skipVotes/{pid}` = stage index. When every connected active player without a result has voted for the current stage (after it started), the host moves to the next stage, or reveals on the last one.
- Stickers: presets are SVG art in `src/ui/stickers.tsx`; custom ones are cropped 1:1 to 160 px (WebP, JPEG fallback) and kept in localStorage (max 12). Throwing one pushes `emotes/{key}` = { pid, k, at } (k = preset id or `c:<id>`); a custom image is uploaded once per room to `stickers/{pid}/{id}`. The host prunes emotes older than 10 s; clients show each new one for 2.8 s, 1.2 s cooldown per player.

## Search (src/core/text.ts)
Diacritics-insensitive; ranks title prefix, word/artist prefix, substring (also ignoring spaces), then fuzzy (optimal string alignment distance, 1-3 typos by word length, also against word prefixes). `searchArtists` returns matching artists (credits split on , & ft. feat. x ...) shown as chips that filter to their songs.

## Types (src/core/types.ts)
```ts
Song { id; title; artist; cover; source: {type:'youtube',videoId} | {type:'local',fileKey}; startOffsetMs: number|null; detectedStartMs? }
Playlist { id; name; kind:'youtube'|'local'; songs; defaultOffsetMs; bestScore; createdAt; youtubeListId? }
GameState { playlistId; queue; index; stage; stages; phase:'preparing'|'ready'|'reveal'|'end'; score; streak; bestStreak; results; wrongGuesses }
```
Start point: `startOffsetMs ?? (youtube ? defaultOffsetMs : detectedStartMs + defaultOffsetMs)`.

## AudioEngine
```ts
interface AudioEngine {
  kind: 'youtube'|'local';
  prepare(song, playlist): Promise<{startMs}>;   // rejects SkipSongError -> skip song
  playClip(durationMs, at?: number /* performance.now() */): Promise<{requestedMs, measuredMs}>;
  stop(): void;
}
```
`engineFor(song)` in `src/audio/index.ts`.

## Decisions
- Two YouTube players (`.yt-host`, youtube-nocookie host for fewer ads) live at body level, 200x200 (API minimum), under the opaque `.app`. The active one plays clips and is positioned over `.video-slot` at reveal (rAF loop; moving an iframe reloads it); the standby one preloads the next song, and `prepare` swaps roles when it already holds the requested song. iOS uses one player (each iframe needs a tap).
- Covers: tiles use YouTube `hqdefault` (zoomed 1.34x to hide the letterbox), reveal swaps in the stored full-size thumbnail; the service worker caches `i.ytimg.com` cache-first.
- UI: themes are CSS token sets on `[data-theme]`; UI sounds are synthesized in `src/ui/sfx.ts`; the clip timeline is a WAAPI clip-path/transform animation started from the engine's `onStart` time.
- YouTube prepare: reset the cached state, `loadVideoById` muted (nudged with playVideo every 1.5 s while not playing/buffering), wait until state PLAYING, the video id matches and currentTime passes start (pre-roll ads play out muted), then pause and seek. Clip: seek only if the player is not already parked at start (a seek forces a rebuffer), unMute, play, start timing on PLAYING with performance.now, mute and pause after the duration, then park at start again.
- Local: decodeAudioData; start = first 10 ms RMS window that stays above -45 dBFS for 30 ms, minus 20 ms pre-roll, capped at 8 s (threshold and pre-roll are dev settings). Clips use AudioBufferSourceNode with 2 ms gain ramps.
- Import: playlists.list (name, existence), playlistItems.list (contentDetails, 50/page), videos.list (snippet,status, 50 ids) drops private, non-embeddable, unprocessed and deleted videos. Re-import keeps edits and best score.
- Search: NFD + strip marks + đ→d; ranks title prefix, then artist/word prefix, then substring; alphabetical with `Intl.Collator('vi')`.
- Dev code: SHA-256 hex in `config.ts`, compared with crypto.subtle; unlock flag in localStorage.
- Multiplayer `/rooms/{code}`: `meta` (hostId, mods, locked, status, createdAt, settings, kicked, winners), `players/{pid}`, `playlist` (no sources), `round` (index, phase, stage, stageStartAt, stages, videoId|clips, ready, results, wrong, answer at reveal only), `hostState` (queue, sources, current: for failover), `history`, `guesses/r{n}`, `commands`. `/featured/{id}` holds full playlists.
- Host loop is stateless per 200 ms tick: decisions come from the snapshot plus server time (`.info/serverTimeOffset`), so a new host continues mid-round. Clients play at `stageStartAt` (= server now + 3000 ms, shown as a 3-2-1 countdown); a stage lasts clip + `intervalSec`. Guess score = `pointsForStage` (1000/700/450/250/100) + speed bonus up to 200 (linear over the stage window). Ties for first trigger sudden-death songs.
- Failover: host disconnected more than 5 s, then the earliest-joined connected player claims `meta/hostId` via transaction.
- Local songs: host cuts each stage as 16-bit mono 22.05 kHz WAV (OfflineAudioContext) into `round.clips`; local covers are re-encoded to 8 KB or less.
- Without a Firebase config, `npm run dev` uses the Database emulator (`demo-tiki`, 127.0.0.1:9000).

## Verified docs (Oct 2026)
- IFrame API: states -1/0/1/2/3/5; errors 2, 5, 100, 101, 150, plus 153 (missing Referer / client id; keep the default referrer policy). The viewport must be at least 200x200. `onAutoplayBlocked` exists. `cueVideoById({videoId,startSeconds})` loads nothing until play or seek.
- Data API v3: playlistItems.list and videos.list cost 1 unit each, maxResults 0-50. Errors: playlistNotFound 404, playlistItemsNotAccessible 403, quotaExceeded 403.
- vite-plugin-pwa 2.0.0 (peer vite 3-8), `registerSW` from `virtual:pwa-register`, types `vite-plugin-pwa/client`, generateSW with workbox globPatterns.
- music-metadata 12.x (maintained, browser `parseBlob` via the `default` export condition). jsmediatags was last published in 2022, so it is not used.
- Firebase JS SDK 13 modular, `firebase/database` only: `databaseURL` required; `onDisconnect(ref).set/cancel`; `.info/connected`, `.info/serverTimeOffset`; `runTransaction`, `increment`, `serverTimestamp`; `connectDatabaseEmulator(db, host, port)`; demo project ids use the `demo-` prefix. Rules have `hasChildren`, `isString`, `matches`, `now`, but no child counting. firebase-tools 15 needs Java 21 (13.x runs on 17).
- Fontsource Be Vietnam Pro and Bricolage Grotesque weight CSS files include the Vietnamese subset (unicode-range); fonts are bundled and precached.

## Known limits
- Permissions (host, mods, dev, kick, lock, 12-player cap) are enforced client-side only; `database.rules.json` only validates shapes and lengths. Anyone with the config can write rooms, and the answer is readable in `hostState` or derivable from `round.videoId`.
- Failover with a local playlist works only if the new host has the same files; otherwise songs are skipped and the match ends.
- Clips under ~0.1 s on YouTube are approximate (postMessage latency, decoder ramp). The debug overlay shows requested vs measured.
- Mix playlists (RD...) are rejected. Local files must be re-picked each session (no persistent file access).
- iOS: a one-time "Chạm để bật âm thanh" step shows the player for one tap before scripted playback (untested on a real device here).
