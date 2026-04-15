# Plotline

A multiplayer party game where players collaboratively create absurd stories by answering prompts without seeing each other's responses.

## Project Structure

```
src/
  app/                    # Next.js App Router (minimal placeholder)
  lib/game/               # Pure game engine (no React, no network)
    types.ts              # Type definitions
    prompts.ts            # Fixed prompts and placeholder pool
    roomCode.ts           # Room code generation
    rotation.ts           # Player-to-prompt assignment algorithm
    game.ts               # Game state reducer (pure function)
    storyAssembly.ts      # Story assembly from completed prompts
    index.ts              # Barrel exports
    __tests__/            # Vitest test suite
```

## Commands

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Start dev server
npm run dev

# Build for production
npm run build
```

## Game Rules

- 4-12 players per room
- 7 prompts per story, one story per player
- Players answer prompts round-by-round without seeing previous answers
- The rotation algorithm ensures no player writes adjacent prompts in any story
- Stories are revealed at the end for maximum comedic effect
# plotline
