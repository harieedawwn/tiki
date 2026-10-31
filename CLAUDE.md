# Tiki

Vite + TypeScript + Preact + vite-plugin-pwa. Read SPEC.md for architecture and decisions.

## Commands
- `npm run dev`: dev server (5173; `.claude/launch.json` entry "dev")
- `npm run build`: `tsc --noEmit` then `vite build` (must pass with no TS errors)
- `npm run preview`: serve `dist` (needed to test the service worker)
- GitHub Pages: `.github/workflows/deploy.yml` builds with `BASE_PATH=/<repo>/` (vite `base`); default base is `/`.
- Multiplayer in dev without config: `npx firebase-tools@13 emulators:start --only database --project demo-tiki` (firebase.json pointing at `database.rules.json`, port 9000). Test two players with `localhost` and `p2.localhost` tabs (separate storage gives separate player ids).

## Conventions
- UI text is Vietnamese; code, comments and docs are English.
- `src/core` is pure (no DOM, no audio); put game rules there and reuse them in UI and multiplayer.
- Audio goes through the `AudioEngine` interface (`src/audio/engine.ts`); get one with `engineFor(song)`.
- Styling: flat colors from CSS tokens in `src/ui/styles.css` only; themes are token sets on `[data-theme]` (list in `THEMES`, `src/data/settings.ts`). 1.5 px lines, rounded corners, hard offset shadows (no blur). No gradients, glow, neon, bloom or emoji. Icons are SVG in `src/ui/icons.tsx`.
- Touch targets at least 48 px; UI transitions at most 200 ms (`--t`), game moments (reveal, bursts, countdown) up to ~800 ms; all disabled under prefers-reduced-motion.
- UI sounds go through `sfx` (`src/ui/sfx.ts`, synthesized, quiet); buttons get a tap sound automatically, opt out with `data-sfx="none"` (e.g. buttons that start a clip).

## Gotchas
- YouTube uses two players (`youtubeEngine()`): the active one plays and is shown at reveal, the standby one preloads the next song (ads play out muted there). Sound pick preloads all options at once (`preloadSet`, up to 4 players on phones, 6 on desktop). iOS keeps one. Never move an iframe in the DOM (that reloads it); use `usePlayerSlot`, which positions the active one.
- Navigation: `go()` in `App.tsx` pushes a history entry per screen (going to a screen already below pops back to it); sheets use `useBackClose` (`src/ui/nav.ts`) so Back closes them first. Don't call `history.replaceState(null, ...)` elsewhere.
- Players must stay at least 200x200 and inside the viewport (under the opaque `.app`), not display:none.
- The dev code is stored only as a SHA-256 hash in `src/config.ts`. Never commit the plaintext.
- Keys come from `VITE_*` env vars (`.env.local` locally, repo secrets in the Pages workflow); never write a key into a source file. See `.env.example`.
- Local files live only in memory (`registerFiles`); playlists reference them by `name:size`.
- Game kinds (`src/core/modes.ts`): classic, random (random start fraction), cover (pick the cover, max 40), sound (see the cover, pick a numbered clip, max 20; multiplayer YouTube only).
- Stage lists are 3-8 long (default 0.5/1/2/6/12 s); a multiplayer stage lasts clip length + `intervalSec`, after a 3 s shared countdown (`LEAD_MS`).
- Multiplayer: never put the answer in `round` before reveal; keep host logic tick-based and derived from the DB so failover works. Extra room options live in `meta/opts` (`RoomOpts`), because the rules fix the shape of `meta/settings`. Manual flow: the host's device starts rounds (`startRoundNow`) and advances (`session.hostNext`). Room-level `emotes`, `stickers` and `round/skipVotes` are unvalidated by the rules on purpose (no rules change needed). RTDB keys cannot contain `. # $ [ ] /` (song ids can, so index by position).
- TypeScript 7 (native `tsc`); Preact 11 types: use `RefObject` and `SVGAttributes` from `preact`.
