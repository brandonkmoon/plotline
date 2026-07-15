# Plotline — Project Status

Last updated: 2026-07-15

## What Plotline Is

A multiplayer blind collaborative storytelling party game (4-10 players). Players write parts of a story without seeing what others wrote, then the stories are read aloud. Web app + iOS app, same real-time server.

## Architecture

| Layer | Tech | Location |
|-------|------|----------|
| Web app | Next.js 16 (App Router, Turbopack) | `~/Projects/plotline/web/` |
| Mobile app | Expo (React Native) | `~/Projects/plotline/mobile/` |
| Real-time server | PartyKit (Cloudflare Workers) | `src/partykit/` in web project |
| Database | Turso (libSQL/SQLite) via Drizzle | Archives completed games |
| Payments | RevenueCat (iOS IAP) | `plotline-app/lib/purchases.ts` |
| Analytics | Plausible | Privacy-friendly, cookieless |
| Domain | plotlinegame.com | Vercel (web), PartyKit (WebSocket) |

## Current State

### iOS App
- **LIVE on App Store: v1.2.1, build 10** ("Ready for Distribution" ~2026-07-15; app ID: 6763647982). First **OTA-capable** build (EAS Update). Bundles the `fix/review-pass-1` mobile fixes (connect-on-room-screen, purchases feedback, leave guard) and sends the RevenueCat App User ID for server-side premium verification. Producer mode ($3.99 lifetime IAP), iPad support, RevenueCat v9.15.2 lazy-loaded, production API key.
  - Prior live build was v1.2.0 build 8 (released 2026-05-07), which predates EAS Update and is NOT OTA-updatable. From v1.2.1 on, JS-only fixes ship via `eas update` with no Apple review.
- **Bundle ID**: com.brandonkmoon.plotline
- **Apple Team ID**: 45F374H7T2

### Web App
- Live at plotlinegame.com
- **Upgraded to Next.js 16 + React 19 (deployed 2026-07-15)** — clears the Next 14 EOL/CVE exposure. Turbopack build. Runtime smoke-tested locally (landing hydration clean, async-`params` routes OK, create-room WebSocket flow OK) before merge. ESLint moved to flat config (`eslint.config.mjs`), pinned ESLint 9; CI lint step non-blocking with a ~30-finding pre-existing backlog to triage.
- All features deployed automatically via Vercel on push to `main`
- Web users cannot purchase Producer mode yet (needs Stripe — future work)
- All rooms created from web are free tier (classic only; competitive requires the iOS app's Producer IAP)

### Server (PartyKit)
- Deployed at plotline.brandonkmoon.partykit.dev
- Deploy command: `npx partykit deploy` (from web project root)
- **Server-side premium verification is LIVE (deployed 2026-07-15).** The server verifies the host's RevenueCat entitlement (`src/partykit/revenuecat.ts`, using the `REVENUECAT_API_KEY` secret) instead of trusting a client flag. Validated end-to-end on-device 2026-07-15 (Producer account → competitive available). Fails closed if the secret is unset.
- **Archive endpoint auth is LIVE (deployed 2026-07-15).** `POST /api/archive` now requires a `Bearer ARCHIVE_SECRET`; the PartyKit server sends it, browsers can't. Secret set identically on Vercel + PartyKit. The server posts to `https://www.plotlinegame.com` (canonical host — `APP_URL` in `partykit.json`) so the apex→www redirect can't strip the auth header. Validated: no-auth/wrong-bearer → 401, correct → passes.
- All rooms: 4–10 player cap
- Free rooms: classic mode only
- Premium rooms: competitive mode unlocked

## Game Modes

### Classic
- Free for everyone
- 7 acts, stories assembled and read aloud
- No scoring

### Competitive (Producer upgrade required)
- Voting on best lines after each scene reveal
- Standing ovations (1 per game, 3 pts to author, 2 pts to voter)
- 1-5 game series with cumulative standings
- Double points on final game
- Awards ceremony: Casting Director, Scene Stealer, Speechwriter, Closer, Fan Favorite, Popularity, Line of the Series
- Tie-breaking: fewest existing awards first, then alphabetical
- 90-second ready/timer flow between games

## Key Features (Recently Shipped)

- **Shareable join links**: plotlinegame.com/join/ABCD — pre-fills room code, auto-reconnects returning players
- **Share button on InfoStrip**: room code + ↗ opens native share sheet on mobile, copies link on desktop
- **Universal Links**: apple-app-site-association deployed, associatedDomains in app config. Will activate when v1.1.0 goes live.
- **Context-sensitive help**: ? button shows one-liner tip for current screen, "Full Program" opens full rules
- **Landing page**: below-fold content with example scene ("Brenda and Gary"), occasion tags, competitive pitch, App Store badge
- **iOS Smart Banner**: meta tag triggers Safari's native app install banner
- **Post-game nudge**: "Loved it? Get the app →" on web end screens
- **Urgent timer**: grows and pulses when ≤30s (yellow) and ≤10s (red)
- **Character names in dialogue prompts**: Acts 5-6 show "What does Brandon say?" instead of "first character"
- **Shorter round timers**: 90s for game 1, 60s for games 2+
- **Instant reconnect**: AppState/visibilitychange listeners force reconnect on foreground

## What's Next

v1.1.0 is approved and live (confirmed 2026-07-14), so these are unblocked:
- **Google Play Store**: $25 dev account needed, then `eas build --platform android` + `eas submit`
- **Share with real users**: everything is ready
- **New app icon**: `icon-alt.png` (playbill style) is ready if Brandon wants to switch
- **Verify Universal Links**: they were set to activate once v1.1.0 went live — worth confirming plotlinegame.com/join/ABCD links open the app

### Future Work
- **Stripe for web**: so web users can purchase Producer mode
- **App Store Promotion**: purchase flow is confirmed working (2026-07-14), so IAP promotion can be enabled in App Store Connect whenever
- **Play-by-mail mode**: async play over hours/days (would need push notifications)
- **In-session async pacing** (deferred 2026-05-04 — see below)

### Potential upgrade: in-session async pacing

Replace (or supplement) the current synchronous round-by-round play with each player pacing themselves through all 7 prompts inside a single ~15-min session. A tracker shows everyone's progress live so players know who they're waiting on.

**Design questions to resolve before building:**

1. **The dependency problem.** Acts 4-5 dialogue prompts ("What does Brenda say?") depend on acts 0-1 (character names) being filled in for that story. In sync mode this is automatic; in async it isn't. Three options:
   - Show placeholder ("What does [Character 1] say?") when name isn't ready — loses named-character magic
   - Block writing prompt 4 until prompt 0 of that story is done — partially defeats async
   - **Force prompt order (0→6) per player** but at their own pace, fall back to placeholder when timing breaks. Probabilistically the dependency is met. Recommended.

2. **Replace sync entirely vs add as new mode.** Adding is safer (compare in the wild before committing); replacing is simpler. Lean: add as a new option in the lobby's mode picker.

**Other things that need to change:**
- Per-prompt timer disappears; replace with a single ~12–15 min overall game timer
- `WaitingScreen` ("Between Acts") goes away entirely
- "Round 1 / Round 2" framing disappears; per-room `currentPromptIndex` becomes per-player `progress`
- End-of-writing trigger: "all players done OR overall timer expired" (whichever first)
- Auto-fill placeholder for unfinished prompts when timer expires, so assembly doesn't break
- Disconnection handling gets harder — a dropped player blocks the entire game; need a 60s timeout + auto-fill rule

**Tracker UI:**
Per-player horizontal dot row, e.g. `Brandon ●●●●●●● done!` / `Rachel ●●●●●○○ 5/7`. Live updates via PartyKit broadcasts.

**What's preserved:**
- Rotation algorithm itself (same N×7 matrix)
- Competitive mode (voting, standing ovations, awards) — orthogonal to pacing
- Reveal flow (group-paced, one story at a time)
- Identity, reconnection, premium gating

**What's at risk:**
- Pacing energy (sync timer keeps things urgent; async lets fast writers stew)
- Anticipation between rounds (gone — reveal becomes more important)
- The shared-moment feel of group-paced play

## Technical Notes

### Server structure (src/partykit/)
```
constants.ts           — config, sanitize
room.ts                — class, lifecycle, broadcasting
handlers/
  connection.ts        — join, disconnect, host transfer
  gameplay.ts          — start, submit, advance, timers
  lobby.ts             — play again, queue, ready flow
  voting.ts            — vote, tally, scores, awards
```

### Tests
- 172 tests, all passing (Vitest)
- Covers: game reducer, rotation, normalization, story assembly, room codes, serialization, server messages, sanitization, awards, scoring, tie-breaking, competitive flow

### Important: isPremium hardcode removed
The server previously hardcoded `isPremium = true` for all rooms (so competitive mode was accessible during development). This was flipped back to `!!msg.isPremium` on 2026-04-30. Now only rooms created by a host with the Producer IAP get premium features.

### RevenueCat Configuration
- **Production key**: appl_ZkvSWqmzlSRzcbHhrBDBZiYamCH
- **Entitlement**: "Plotline: The Party Game Pro"
- **Offering**: "default" with lifetime package
- **SDK**: react-native-purchases v9.15.2 (v10 caused crash on iPad)
- **Lazy loading**: RevenueCat only initializes when a purchase function is called, not on app launch

### Environment
- Web deploys: push to `main` → Vercel auto-deploys
- PartyKit deploys: `npx partykit deploy` (manual)
- iOS builds: `eas build --platform ios --profile production`
- iOS submit: `eas submit --platform ios --latest`
- Tests: `npx vitest run` (from web project root)

### Over-the-air updates (EAS Update — configured 2026-07-14)
- JS-only changes (screens, game UI, styling, bug fixes) ship without Apple review:
  `eas update --channel production --message "what changed"` (from mobile project root)
- Users receive the update on their next app launch after publish
- NOT active until the next store build ships — the current live v1.1.0 build predates this config, so the first update-capable version is whatever build goes out next
- Runtime version policy is "appVersion": an OTA update only reaches builds with the same `version` in app.json (currently 1.2.0). Bumping the version means shipping a new store build before OTA works again for that version.
- Still requires a store build + Apple review: new native packages, Expo SDK upgrades, icon/permissions/entitlements changes
