# Plotline — Project Status

Last updated: 2026-04-30

## What Plotline Is

A multiplayer blind collaborative storytelling party game (4-12 players). Players write parts of a story without seeing what others wrote, then the stories are read aloud. Web app + iOS app, same real-time server.

## Architecture

| Layer | Tech | Location |
|-------|------|----------|
| Web app | Next.js 14 (App Router) | `~/Desktop/plotline/` |
| Mobile app | Expo (React Native) | `~/Desktop/plotline-app/` |
| Real-time server | PartyKit (Cloudflare Workers) | `src/partykit/` in web project |
| Database | Turso (libSQL/SQLite) via Drizzle | Archives completed games |
| Payments | RevenueCat (iOS IAP) | `plotline-app/lib/purchases.ts` |
| Analytics | Plausible | Privacy-friendly, cookieless |
| Domain | plotlinegame.com | Vercel (web), PartyKit (WebSocket) |

## Current State

### iOS App
- **v1.0.0**: Approved and live on App Store (app ID: 6763647982)
- **v1.1.0**: Submitted for Apple review (build 7). Includes:
  - Producer mode ($3.99 lifetime IAP via RevenueCat)
  - iPad support (supportsTablet: true)
  - RevenueCat v9.15.2 with lazy loading (fixed v10 crash on iPad)
  - Production API key (was using test key)
  - All gameplay improvements from the web app
- **Bundle ID**: com.brandonkmoon.plotline
- **Apple Team ID**: 45F374H7T2

### Web App
- Live at plotlinegame.com
- All features deployed automatically via Vercel on push to `main`
- Web users cannot purchase Producer mode yet (needs Stripe — future work)
- All rooms created from web are free tier (8 players, classic only)

### Server (PartyKit)
- Deployed at plotline.brandonkmoon.partykit.dev
- Deploy command: `npx partykit deploy` (from web project root)
- `isPremium` flag is live — set by client on room creation
- Free rooms: 8 player max, classic mode only
- Premium rooms: 12 player max, competitive mode unlocked

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

### After Apple approves v1.1.0
- **Google Play Store**: $25 dev account needed, then `eas build --platform android` + `eas submit`
- **Share with real users**: everything is ready
- **New app icon**: `icon-alt.png` (playbill style) is ready if Brandon wants to switch

### Future Work
- **Stripe for web**: so web users can purchase Producer mode
- **App Store Promotion**: enable IAP promotion once purchase flow is confirmed working
- **Async play mode**: play-by-mail style over hours/days (would need push notifications)

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
