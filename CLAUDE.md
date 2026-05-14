# CLAUDE.md — ziiiTV (TV Tizen App)

## Repo: ziiiTV
This repo contains ONLY the Samsung Tizen TV application source code.

## What belongs here
- `src/App.tsx` and all TV app logic
- `src/screens/` — all TV screen components
- `src/components/` — all TV UI components
- `src/services/` — TV-side services (playerManager, pairingService, etc.)
- `src/store/` — Zustand stores
- `public/` — Tizen manifest, icons, assets

## What does NOT belong here
- Edge Functions → commit to `/home/carneiro888/Documentos/zikualdo/ziiitv-admin`
- Admin panel pages → commit to ziiitv-admin
- `src/lib/` (m3uProcessor, tmdb) → commit to ziiitv-admin

## Critical constraints

### Never use Supabase SDK on the TV
The Tizen browser is Chrome 56 — Supabase JS SDK is incompatible. All Supabase communication uses raw `fetch()` calls with the REST API directly.

### Vite lock
Do NOT change the Vite version or add new bundler plugins without explicit user approval. The current config is tuned for Tizen/legacy Chrome 56 targets with specific polyfills.

### No unnecessary comments
Write zero comments unless the WHY is genuinely non-obvious. No docstrings, no block comments explaining what the code does.

### Test on TV / emulator
Always remind the user to test on the Samsung emulator or real TV — never assume browser testing is sufficient for Tizen-specific APIs (webapis, avplay, tizen.*).

### No new npm packages without approval
The bundle size and compatibility constraints are strict. Ask before adding any new dependency.

## Architecture invariants
- **Hole punch rendering**: AVPlay occupies a native layer below the React canvas. Never use CSS `transform`, `opacity`, or `filter` on the player container — it breaks hole punch.
- **Vanilla JS bypass**: For performance-critical carousel scroll, direct DOM manipulation is used instead of React state to avoid 60fps re-render bottlenecks.
- **Netflix carousel**: Rows scroll horizontally; focus management uses `keyboardMaestro` service, not native browser focus.
- **Data pipeline**: M3U → store → normalizedGroups → TMDB enrichment. Never bypass the store.

## Git rules
- Commit TV code here, in `/home/carneiro888/Documentos/zikualdo/ziiiTV`
- Never commit admin/Edge Function files into this repo
- Never mix the two repos in a single commit or push
