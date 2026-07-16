# Plotline

A multiplayer blind collaborative storytelling party game for 4–10 players, inspired by the Victorian parlor game "Consequences." Players each contribute one piece of a scene without seeing what others wrote, then the scenes are revealed for laughs.

Built by Brandon Moon.

## Theme & Design

Playbill / Broadway theater program aesthetic. Yellow (`#fceb00`) banner header, black (`#1a1a1a`) ink, white (`#ffffff`) background, sharp editorial typography. No rounded corners. The title "PLOTLINE" is rendered as a pre-generated PNG (`public/plotline-title.png`) using Latin CG Bold to avoid font-loading flash. Fonts: Playfair Display (headings), Lora (body/italic), Inter (UI/sans).

**Terminology**: Acts = the 7 writing rounds. Scenes = the finished collaborative stories. Series = a multi-game competitive run.

## How the Game Works

Each game has 7 acts. Every player writes one response per act, contributing to multiple scenes simultaneously (round-robin rotation). The prompts:

| Act | Prompt | UI |
|-----|--------|----|
| 0 | "Pick someone in this room. Who are they really?" | Name picker + descriptor |
| 1 | "Pick someone else. What's their deal?" | Name picker + descriptor |
| 2 | "Where are they?" | Free text |
| 3 | "What are they doing?" | Free text |
| 4 | "What does [Character 1] say?" | Free text (shows actual character name) |
| 5 | "What does [Character 2] say back?" | Free text (shows actual character name) |
| 6 | "How does it end?" | Free text |

Acts 0–1 use a name-picker UI where players tap another player's name, then write a character descriptor. Acts 4–5 show the actual character names from the scene the player is writing for, so they know who they're writing dialogue for.

Scenes are assembled in `storyAssembly.ts` into a template: "[Name1] and [Name2] are [location], [action]. [Name1] says, '[dialogue]' [Name2] says, '[dialogue]' Then, [ending]."

## Game Modes

### Classic (Free)
- 7 acts, scenes assembled and read aloud
- No scoring, just fun

### Competitive (Producer upgrade — $3.99 lifetime IAP)
- Voting on best lines after each scene reveal
- Standing ovations: 1 per game, 3 pts to author, 2 pts to voter
- 1-5 game series with cumulative standings
- Double points on final game
- 90-second ready/timer flow between games
- Awards ceremony: Casting Director, Scene Stealer, Speechwriter, Closer, Fan Favorite, Popularity, Line of the Series
- Tie-breaking: fewest existing awards first, then alphabetical
- Round timer: 90s for game 1, 60s for games 2+

## Tech Stack

- **Framework**: Next.js 14 (App Router, Server Components)
- **Mobile**: Expo (React Native) — `~/Projects/plotline/mobile/`
- **Realtime**: Cloudflare **partyserver** (Durable Objects; migrated off PartyKit 2026-07-16). Client still uses `partysocket`.
- **Database**: Turso (libSQL/SQLite) via Drizzle ORM — for archiving completed games
- **Payments**: RevenueCat (react-native-purchases v9.15.2) — iOS IAP only for now
- **Styling**: Tailwind CSS + custom CSS variables in `globals.css`
- **Testing**: Vitest (172 tests)
- **Analytics**: Plausible
- **Hosting**: Vercel (web) + Cloudflare Workers/Durable Objects (realtime server)
- **Domain**: plotlinegame.com
- **PWA**: Custom service worker (`public/sw.js`), manifest, iOS meta tags

## Project Structure

```
src/
├── app/                    # Next.js pages & API routes
│   ├── layout.tsx          # Root layout, fonts, meta tags, Smart Banner
│   ├── page.tsx            # Home → TitleScreen (with landing page)
│   ├── create/page.tsx     # Create room flow
│   ├── join/page.tsx       # Join room flow
│   ├── join/[code]/page.tsx # Direct join via shared link
│   ├── room/[code]/page.tsx # Main game room (lobby → play → reveal → end)
│   ├── archive/[code]/     # Read-only archived game view
│   └── api/
│       ├── archive/        # Archive API endpoints
│       └── og/[code]/[storyIndex]/ # OG image generation
├── components/
│   ├── screens/            # Full-screen game phases
│   │   ├── TitleScreen.tsx      # Landing with animated buttons + below-fold content
│   │   ├── CreateScreen.tsx     # Host enters name, generates room code
│   │   ├── JoinScreen.tsx       # Player enters code + name
│   │   ├── LobbyScreen.tsx      # Waiting room, mode picker, Producer upgrade
│   │   ├── SpectatorScreen.tsx  # Mid-game joiners watch + ready up
│   │   ├── PromptScreen.tsx     # Name picker (acts 0-1) or free text input
│   │   ├── WaitingScreen.tsx    # "Between Acts" screen
│   │   ├── RevealScreen.tsx     # Scenes revealed one by one
│   │   ├── VotingScreen.tsx     # Competitive: vote on best lines
│   │   ├── EndScreen.tsx        # Classic game over, share/archive
│   │   └── CompetitiveEndScreen.tsx # Scores, awards, series flow
│   ├── Button.tsx          # Primary/secondary button component
│   ├── PlaybillBanner.tsx  # Yellow header banner with title PNG
│   ├── HelpOverlay.tsx     # Context-sensitive tips + Full Program overlay
│   ├── PlayerList.tsx      # Unified player list with badges
│   └── PendingPlayersBadge.tsx  # Badge for pending mid-game joiners
├── lib/
│   ├── game/
│   │   ├── types.ts        # Room, Player, Story, GameMode, Vote, SeriesState, etc.
│   │   ├── prompts.ts      # 7 prompts, placeholders, name-picker helpers
│   │   ├── storyAssembly.ts # Assembles responses into narrative sections
│   │   ├── rotation.ts     # Round-robin story assignment logic
│   │   ├── normalize.ts    # Text normalization (capitalization, punctuation)
│   │   ├── roomCode.ts     # Room code generation
│   │   └── game.ts         # Core game state machine (reducer)
│   ├── multiplayer/
│   │   ├── gameClient.ts   # Client-side WebSocket connection manager
│   │   └── types.ts        # Wire protocol types (ClientMessage, ServerMessage)
│   ├── client/
│   │   └── RoomContext.tsx  # React context for room state, player info
│   ├── helpContext.ts      # Global store for context-sensitive help tips
│   ├── db/                 # Drizzle schema + client for Turso
│   └── analytics.ts        # Plausible event tracking
└── partykit/
    ├── constants.ts        # Config values, sanitize function
    ├── room.ts             # Main server class, lifecycle, broadcasting
    ├── registry.ts         # Room registry for cleanup
    └── handlers/
        ├── connection.ts   # Join, disconnect, host transfer
        ├── gameplay.ts     # Start, submit, advance, timers
        ├── lobby.ts        # Play again, queue, ready flow
        └── voting.ts       # Vote, tally, scores, awards
```

## Key Architecture Decisions

**Shared code with mobile (this repo is CANONICAL)**: Five pure files are duplicated in the mobile app (`plotline-mobile`) and this repo is the source of truth: `src/lib/game/{types,normalize,roomCode,prompts}.ts` and `src/lib/multiplayer/types.ts` (the wire protocol — runtime-version-checked, so silent drift can brick shipped iOS builds). Change them HERE, push, then run `npm run sync:shared` in the mobile repo. Mobile CI fails on drift (it fetches these files from this public repo's `main` and diffs). Mobile has no game engine — the reducer/rotation/assembly live only here (server-side).

**Identity & Reconnection**: Players are identified by `playerId` stored in `sessionStorage` (per-tab) with `localStorage` fallback (cross-tab reconnection). The server supports name-based reconnection. Mobile app uses AsyncStorage. Both platforms force reconnect on app foreground (AppState/visibilitychange).

**Unique Names**: Enforced server-side at join time (case-insensitive). Returns `NAME_TAKEN` error if duplicate.

**`forceNewPlayer: true`**: Used in JoinScreen and CreateScreen to clear stored identity and always create a fresh player.

**Round-robin rotation**: Each player writes for a different scene each act. With N players and 7 acts, there are N scenes.

**isPremium**: Set on room creation, but **only after the server verifies the host's Producer entitlement with RevenueCat** — never trusted from the client. The iOS host sends its RevenueCat App User ID with JOIN_ROOM; the PartyKit room calls RevenueCat's REST API (`src/partykit/revenuecat.ts`, using the `REVENUECAT_API_KEY` secret) and enables premium only if the entitlement is active. Fails closed if the key is unset. Persists for the life of the room, even across game resets and host transfers. All rooms support 4–10 players regardless of tier — `isPremium` only gates competitive mode.

**Input sanitization**: All player names and responses are sanitized at the server boundary (HTML tags stripped, special chars escaped, max lengths enforced).

**Shareable join links**: `plotlinegame.com/join/ABCD` pre-fills room code. Auto-reconnects if player has stored identity. Universal Links configured for iOS native app.

## Environment Variables

```
TURSO_DATABASE_URL           # Turso remote DB URL
TURSO_AUTH_TOKEN             # Turso auth token
NEXT_PUBLIC_PARTYKIT_HOST    # PartyKit server (default: localhost:1999)
APP_URL                      # Internal API base URL
NEXT_PUBLIC_APP_URL          # Public URL for meta tags / archive links
NEXT_PUBLIC_PLAUSIBLE_DOMAIN # Plausible analytics domain
ARCHIVE_SECRET               # Shared secret gating POST /api/archive. Must be
                             # the SAME value here (Vercel) and on PartyKit
                             # (below). Unset = archive endpoint is open.
```

**Realtime-server secrets** (set on the Worker, not in Next.js — `npx wrangler secret put <KEY>`):
```
REVENUECAT_API_KEY           # RevenueCat SECRET v1 API key — server verifies
                             # the Producer entitlement. Unset = premium denied.
ARCHIVE_SECRET               # Same value as the Vercel ARCHIVE_SECRET above.
                             # The server sends it as a Bearer token when it
                             # POSTs completed games to /api/archive.
```

## Development

```bash
npm run dev          # Next.js dev server (port 3000)
npm run pk:dev       # Realtime server via `wrangler dev` (port 8787) — separate terminal
npx vitest run       # Run all tests
npx vitest run --watch # Vitest watch mode
npm run typecheck    # tsc for the Next app + the worker (tsconfig.worker.json)
```

## Database migrations (Turso / Drizzle)

`npm run db:push` (drizzle-kit push) is fine for **local dev** — it syncs the
schema directly. But for **production schema changes**, generate and commit the
SQL first so there's a migration history and no silent column drop/recreate on
the live archive data:

```bash
npm run db:generate   # drizzle-kit generate → SQL migration files (commit these)
# then apply the reviewed migration to prod (do NOT push straight to prod)
```

## Deploy

```bash
# Web app — auto-deploys on push to main via Vercel
git push origin main

# Realtime server (Cloudflare partyserver) — manual deploy
npx wrangler deploy   # deploys src/partykit/server.ts to plotline.brandonkmoon.workers.dev

# iOS build + submit
cd ~/Projects/plotline/mobile
eas build --platform ios --profile production
eas submit --platform ios --latest
```

## Known Cleanup Items

_(none — the old dead font / service-worker copies / mock HTML artifacts have
all been removed.)_
