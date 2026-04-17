# Plotline

A multiplayer blind collaborative storytelling party game for 4–12 players, inspired by the Victorian parlor game "Consequences." Players each contribute one piece of a story without seeing what others wrote, then the stories are revealed for laughs.

Built by Brandon Moon.

## Theme & Design

Playbill / Broadway theater program aesthetic. Yellow (`#fceb00`) banner header, black (`#1a1a1a`) ink, white (`#ffffff`) background, sharp editorial typography. No rounded corners. The title "PLOTLINE" is rendered as a pre-generated PNG (`public/plotline-title.png`) using Latin CG Bold to avoid font-loading flash. Fonts: Playfair Display (headings), Lora (body/italic), Inter (UI/sans).

## How the Game Works

Each game has 7 rounds. Every player writes one response per round, contributing to multiple stories simultaneously (round-robin rotation). The prompts:

| Round | Prompt | UI |
|-------|--------|----|
| 0 | "Pick someone in this room. Who are they really?" | Name picker + descriptor |
| 1 | "Pick someone else. What's their deal?" | Name picker + descriptor |
| 2 | "Where are they?" | Free text |
| 3 | "What are they doing?" | Free text |
| 4 | "What does the first one say?" | Free text |
| 5 | "What does the other one say back?" | Free text |
| 6 | "How does it end?" | Free text |

Rounds 0–1 use a name-picker UI where players tap another player's name, then write a character descriptor (e.g., "Dave — a retired sword swallower with trust issues"). Round 0 picks are dimmed in round 1 to encourage variety. The full "Name — descriptor" is used in story introductions, but dialogue attribution uses only the short name extracted via `extractName()`.

All prompts use present tense. Placeholder examples model correct phrasing so players imitate the style.

Stories are assembled in `storyAssembly.ts` into a template: "[Name1] and [Name2] are [location], [action]. [Name1] says, '[dialogue]' [Name2] says, '[dialogue]' Then, [ending]."

## Tech Stack

- **Framework**: Next.js 14 (App Router, Server Components)
- **Realtime**: PartyKit (Cloudflare-based WebSocket server) — `src/partykit/room.ts`
- **Database**: Turso (libSQL/SQLite) via Drizzle ORM — for archiving completed games
- **Styling**: Tailwind CSS + custom CSS variables in `globals.css`
- **Testing**: Vitest
- **Analytics**: Plausible
- **Hosting**: Vercel (web) + PartyKit (WebSocket server)
- **Domain**: plotlinegame.com
- **PWA**: Custom service worker (`public/sw.js`), manifest, iOS meta tags

## Project Structure

```
src/
├── app/                    # Next.js pages & API routes
│   ├── layout.tsx          # Root layout, fonts, meta tags, SW registration
│   ├── page.tsx            # Home → TitleScreen
│   ├── create/page.tsx     # Create room flow
│   ├── join/page.tsx       # Join room flow
│   ├── room/[code]/page.tsx # Main game room (lobby → play → reveal → end)
│   ├── archive/[code]/     # Read-only archived game view
│   └── api/archive/        # Archive API endpoints
├── components/
│   ├── screens/            # Full-screen game phases
│   │   ├── TitleScreen.tsx      # Landing with animated buttons
│   │   ├── CreateScreen.tsx     # Host enters name, generates room code
│   │   ├── JoinScreen.tsx       # Player enters code + name
│   │   ├── LobbyScreen.tsx      # Waiting room, shows cast, "Start the Show"
│   │   ├── PendingLobbyScreen.tsx # Mid-game joiners wait here
│   │   ├── PromptScreen.tsx     # Name picker (rounds 0-1) or free text input
│   │   ├── WaitingScreen.tsx    # "Waiting for others..." between rounds
│   │   ├── RevealScreen.tsx     # Stories revealed one by one
│   │   └── EndScreen.tsx        # Game over, archive link
│   ├── Button.tsx          # Primary/secondary button component
│   ├── PlaybillBanner.tsx  # Yellow header banner with title PNG
│   ├── HelpOverlay.tsx     # How-to-play overlay (? button, bottom-right)
│   ├── PlayerTag.tsx       # Player name pill with status indicators
│   └── PendingPlayersBadge.tsx  # Badge for pending mid-game joiners
├── lib/
│   ├── game/
│   │   ├── types.ts        # Room, Player, Story, PromptSlot, GameAction types
│   │   ├── prompts.ts      # 7 prompts, placeholders, name-picker helpers
│   │   ├── storyAssembly.ts # Assembles responses into narrative sections
│   │   ├── rotation.ts     # Round-robin story assignment logic
│   │   ├── normalize.ts    # Text normalization (capitalization, punctuation)
│   │   ├── roomCode.ts     # Room code generation
│   │   └── game.ts         # Core game state machine
│   ├── multiplayer/
│   │   ├── gameClient.ts   # Client-side WebSocket connection manager
│   │   └── types.ts        # Wire protocol types, ConnectionErrorReason
│   ├── client/
│   │   └── RoomContext.tsx  # React context for room state, player info
│   ├── db/                 # Drizzle schema + client for Turso
│   └── analytics.ts        # Plausible event tracking
└── partykit/
    ├── room.ts             # Main PartyKit server — all game logic
    └── registry.ts         # Room registry for cleanup
```

## Key Architecture Decisions

**Identity & Reconnection**: Players are identified by `playerId` stored in `sessionStorage` (per-tab) with `localStorage` fallback (cross-tab reconnection). The server supports name-based reconnection: if a player reconnects without a stored `playerId` but their name matches a disconnected player, they're reconnected rather than duplicated.

**Unique Names**: Enforced server-side at join time (case-insensitive). Returns `NAME_TAKEN` error if duplicate.

**`forceNewPlayer: true`**: Used in JoinScreen and CreateScreen to clear stored identity and always create a fresh player. This is intentional — it prevents stale reconnections when someone starts a new game.

**Round-robin rotation**: Each player writes for a different story each round. With N players and 7 rounds, there are N stories. Player assignments rotate so no one writes two prompts for the same story.

**Submitted-then-disconnected**: If a player submits their response then disconnects, the server preserves their "submitted" status instead of overwriting it with "reconnecting."

## Environment Variables

```
TURSO_DATABASE_URL           # Turso remote DB URL
TURSO_AUTH_TOKEN             # Turso auth token
NEXT_PUBLIC_PARTYKIT_HOST    # PartyKit server (default: localhost:1999)
APP_URL                      # Internal API base URL
NEXT_PUBLIC_APP_URL          # Public URL for meta tags / archive links
NEXT_PUBLIC_PLAUSIBLE_DOMAIN # Plausible analytics domain
```

## Development

```bash
npm run dev          # Next.js dev server (port 3000)
npx partykit dev     # PartyKit dev server (port 1999) — run in separate terminal
npm run test         # Vitest
npm run test:watch   # Vitest watch mode
```

## Deploy

Web app deploys to Vercel on push to `main`. PartyKit deploys separately via `npx partykit deploy`. The Turso database is remote and shared across environments.

## Known Cleanup Items

- `public/fonts/Latin CG Bold Regular.otf` — dead file, can be deleted (title is now a PNG)
- Duplicate `sw 2-6.js` and `workbox-*.js` files in `public/` — stale copies, delete them
