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
- Styling: flat colors from CSS tokens in `src/ui/styles.css` only. 2 px ink borders, hard offset shadows, no gradients, blur or emoji. Icons are SVG in `src/ui/icons.tsx`.
- Touch targets at least 48 px; motion at most 200 ms (`--t`), disabled under prefers-reduced-motion.

## Gotchas
- Keep exactly one YouTube player (`youtubeEngine()`); never move its iframe in the DOM, because that reloads it. Use `usePlayerSlot`.
- The player must stay at least 200x200 and inside the viewport (under the opaque `.app`), not display:none.
- The dev code is stored only as a SHA-256 hash in `src/config.ts`. Never commit the plaintext.
- Keys come from `VITE_*` env vars (`.env.local` locally, repo secrets in the Pages workflow); never write a key into a source file. See `.env.example`.
- Local files live only in memory (`registerFiles`); playlists reference them by `name:size`.
- Stage lists are 3-8 long (default 0.5/1/2/6/12 s); a multiplayer stage lasts clip length + `intervalSec`, after a 3 s shared countdown (`LEAD_MS`).
- Multiplayer: never put the answer in `round` before reveal; keep host logic tick-based and derived from the DB so failover works. RTDB keys cannot contain `. # $ [ ] /` (song ids can, so index by position).
- TypeScript 7 (native `tsc`); Preact 11 types: use `RefObject` and `SVGAttributes` from `preact`.
