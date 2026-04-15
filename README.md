# Plotline

A blind collaborative storytelling party game for 4-12 players. Players take turns filling in prompts without seeing each other's responses, then read the resulting absurd stories aloud.

## Local Development

```bash
# Install dependencies
npm install

# Start PartyKit server (multiplayer)
npm run partykit:dev

# Start Next.js dev server (in a separate terminal)
npm run dev

# Push database schema (first time only)
npm run db:push
```

No external services required for local development -- the app uses a local SQLite file and local PartyKit server by default.

## Tests

```bash
npm test            # Run all tests
npm run test:watch  # Watch mode
```

## Architecture

```
src/
  app/                  # Next.js App Router pages
    api/archive/        # Archive API (POST to save, GET to retrieve)
    archive/[code]/     # Archive view page
    join/               # Join game page
    privacy/            # Privacy policy
    room/[code]/        # Game room page
  components/           # React components
    screens/            # Game screen components
    archive/            # Archive view components
  lib/
    game/               # Pure game engine (no React, no network)
    multiplayer/        # WebSocket client and message types
    client/             # React context for room state
    db/                 # Database schema and connection
    archive/            # Archive serialization
    analytics.ts        # Plausible event tracking
  partykit/             # PartyKit server (room.ts, registry.ts)
```

## Deployment

### Turso (Database)

1. Create a Turso database: `turso db create plotline`
2. Get the URL: `turso db show plotline --url`
3. Create a token: `turso db tokens create plotline`
4. Set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in your deployment environment

### Vercel (Frontend)

1. Connect your GitHub repo in the Vercel dashboard
2. Set environment variables (see below)
3. Deploy

### PartyKit (Multiplayer)

1. Deploy: `npx partykit deploy`
2. Set `APP_URL` in PartyKit environment config (your Vercel deployment URL)
3. Set `NEXT_PUBLIC_PARTYKIT_HOST` in Vercel to your PartyKit deployment host

### Plausible (Analytics)

1. Create a Plausible account and add your domain
2. Set `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` to your domain

### Sentry (Error Monitoring)

1. Create a Sentry project for Next.js
2. Set `NEXT_PUBLIC_SENTRY_DSN` and `SENTRY_AUTH_TOKEN`

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `TURSO_DATABASE_URL` | Production | `file:plotline.db` | Turso database URL |
| `TURSO_AUTH_TOKEN` | Production | - | Turso auth token |
| `NEXT_PUBLIC_PARTYKIT_HOST` | Production | `localhost:1999` | PartyKit server host |
| `APP_URL` | Production | `http://localhost:3000` | App URL for PartyKit API calls |
| `NEXT_PUBLIC_APP_URL` | No | `http://localhost:3000` | Public URL for meta tags |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | No | - | Plausible analytics domain |
| `NEXT_PUBLIC_SENTRY_DSN` | No | - | Sentry DSN |
| `SENTRY_AUTH_TOKEN` | No | - | Sentry auth token for source maps |

## Game Rules

- 4-12 players per room
- 7 prompts per story, one story per player
- Players answer prompts round-by-round without seeing previous answers
- The rotation algorithm ensures no player writes adjacent prompts in any story
- Stories are revealed at the end for maximum comedic effect
