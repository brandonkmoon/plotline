import { describe, it, expect } from "vitest";
import { gameReducer, createRoom } from "../game";
import type { Room, Player, GameAction } from "../types";

function makePlayer(id: string, name: string, isHost = false): Player {
  return { id, name, isHost, isConnected: true, joinedAt: Date.now() };
}

function createLobbyWith(n: number): Room {
  const room = createRoom("ABCD", { id: "host", name: "Host" }, 1000);
  let state = room;
  for (let i = 1; i < n; i++) {
    state = gameReducer(state, {
      type: "PLAYER_JOINED",
      player: makePlayer(`p${i}`, `Player ${i}`),
    });
  }
  return state;
}

describe("createRoom", () => {
  it("creates a room in LOBBY state", () => {
    const room = createRoom("ABCD", { id: "host", name: "Host" }, 1000);
    expect(room.state).toBe("LOBBY");
    expect(room.code).toBe("ABCD");
    expect(room.players).toHaveLength(1);
    expect(room.players[0].isHost).toBe(true);
    expect(room.hostId).toBe("host");
  });
});

describe("PLAYER_JOINED", () => {
  it("adds a player in LOBBY state", () => {
    const room = createRoom("ABCD", { id: "host", name: "Host" }, 1000);
    const next = gameReducer(room, {
      type: "PLAYER_JOINED",
      player: makePlayer("p1", "Alice"),
    });
    expect(next.players).toHaveLength(2);
  });

  it("rejects join when room is full", () => {
    const room = createLobbyWith(10);
    const next = gameReducer(room, {
      type: "PLAYER_JOINED",
      player: makePlayer("extra", "Extra"),
    });
    expect(next.players).toHaveLength(10);
  });

  it("rejects join in PLAYING state", () => {
    let room = createLobbyWith(4);
    room = gameReducer(room, {
      type: "GAME_STARTED",
      hostId: "host",
      timestamp: 2000,
    });
    const next = gameReducer(room, {
      type: "PLAYER_JOINED",
      player: makePlayer("late", "Late"),
    });
    expect(next.players).toHaveLength(4);
  });

  it("rejects duplicate player id", () => {
    const room = createRoom("ABCD", { id: "host", name: "Host" }, 1000);
    const next = gameReducer(room, {
      type: "PLAYER_JOINED",
      player: makePlayer("host", "Host Again"),
    });
    expect(next.players).toHaveLength(1);
  });
});

describe("PLAYER_LEFT", () => {
  it("removes a player", () => {
    const room = createLobbyWith(4);
    const next = gameReducer(room, { type: "PLAYER_LEFT", playerId: "p1" });
    expect(next.players).toHaveLength(3);
  });

  it("transfers host when host leaves", () => {
    const room = createLobbyWith(4);
    const next = gameReducer(room, { type: "PLAYER_LEFT", playerId: "host" });
    expect(next.hostId).not.toBe("host");
    expect(next.players.find((p) => p.isHost)).toBeTruthy();
  });

  it("transitions to DESTROYED when all players leave", () => {
    const room = createRoom("ABCD", { id: "host", name: "Host" }, 1000);
    const next = gameReducer(room, { type: "PLAYER_LEFT", playerId: "host" });
    expect(next.state).toBe("DESTROYED");
  });
});

describe("GAME_STARTED", () => {
  it("transitions LOBBY to PLAYING with >= 4 players", () => {
    const room = createLobbyWith(4);
    const next = gameReducer(room, {
      type: "GAME_STARTED",
      hostId: "host",
      timestamp: 2000,
    });
    expect(next.state).toBe("PLAYING");
    expect(next.stories).toHaveLength(4);
    expect(next.currentRound).toBe(0);
  });

  it("rejects start with fewer than 4 players", () => {
    const room = createLobbyWith(3);
    const next = gameReducer(room, {
      type: "GAME_STARTED",
      hostId: "host",
      timestamp: 2000,
    });
    expect(next.state).toBe("LOBBY");
  });

  it("rejects start from non-host", () => {
    const room = createLobbyWith(4);
    const next = gameReducer(room, {
      type: "GAME_STARTED",
      hostId: "p1",
      timestamp: 2000,
    });
    expect(next.state).toBe("LOBBY");
  });

  it("generates stories with 7 slots each", () => {
    const room = createLobbyWith(5);
    const next = gameReducer(room, {
      type: "GAME_STARTED",
      hostId: "host",
      timestamp: 2000,
    });
    for (const story of next.stories) {
      expect(story.slots).toHaveLength(7);
    }
  });
});

describe("PROMPT_SUBMITTED", () => {
  function startedGame(): Room {
    const room = createLobbyWith(4);
    return gameReducer(room, {
      type: "GAME_STARTED",
      hostId: "host",
      timestamp: 2000,
    });
  }

  it("records a response for the correct slot", () => {
    const game = startedGame();
    const slot = game.stories[0].slots[0];
    const next = gameReducer(game, {
      type: "PROMPT_SUBMITTED",
      playerId: slot.playerId!,
      storyIndex: 0,
      promptIndex: 0,
      response: "Test response",
    });
    expect(next.stories[0].slots[0].response).toBe("Test response");
  });

  it("rejects submission for wrong round", () => {
    const game = startedGame();
    const slot = game.stories[0].slots[1]; // round 1, but current is 0
    const next = gameReducer(game, {
      type: "PROMPT_SUBMITTED",
      playerId: slot.playerId!,
      storyIndex: 0,
      promptIndex: 1,
      response: "Wrong round",
    });
    expect(next.stories[0].slots[1].response).toBeNull();
  });

  it("rejects submission from wrong player", () => {
    const game = startedGame();
    const next = gameReducer(game, {
      type: "PROMPT_SUBMITTED",
      playerId: "nobody",
      storyIndex: 0,
      promptIndex: 0,
      response: "Unauthorized",
    });
    expect(next.stories[0].slots[0].response).toBeNull();
  });

  it("auto-advances round when all submissions are in", () => {
    let game = startedGame();
    // Submit all round 0 prompts
    for (const story of game.stories) {
      const slot = story.slots[0];
      game = gameReducer(game, {
        type: "PROMPT_SUBMITTED",
        playerId: slot.playerId!,
        storyIndex: story.index,
        promptIndex: 0,
        response: `Response for story ${story.index}`,
      });
    }
    expect(game.currentRound).toBe(1);
  });
});

describe("HOST_ADVANCED", () => {
  it("fills placeholders and advances round", () => {
    let game = createLobbyWith(4);
    game = gameReducer(game, {
      type: "GAME_STARTED",
      hostId: "host",
      timestamp: 2000,
    });

    // Submit only one response for round 0
    const slot = game.stories[0].slots[0];
    game = gameReducer(game, {
      type: "PROMPT_SUBMITTED",
      playerId: slot.playerId!,
      storyIndex: 0,
      promptIndex: 0,
      response: "Only submission",
    });

    game = gameReducer(game, {
      type: "HOST_ADVANCED",
      hostId: "host",
      timestamp: 3000,
    });

    expect(game.currentRound).toBe(1);
    // The submitted one should keep its response
    expect(game.stories[0].slots[0].response).toBe("Only submission");
    expect(game.stories[0].slots[0].isPlaceholder).toBe(false);
    // Others should be filled with placeholders
    for (let i = 1; i < game.stories.length; i++) {
      expect(game.stories[i].slots[0].response).not.toBeNull();
      expect(game.stories[i].slots[0].isPlaceholder).toBe(true);
    }
  });

  it("transitions to REVEAL after round 7", () => {
    let game = createLobbyWith(4);
    game = gameReducer(game, {
      type: "GAME_STARTED",
      hostId: "host",
      timestamp: 2000,
    });

    // Advance through all 7 rounds
    for (let round = 0; round < 7; round++) {
      game = gameReducer(game, {
        type: "HOST_ADVANCED",
        hostId: "host",
        timestamp: 3000 + round,
      });
    }

    expect(game.state).toBe("REVEAL");
  });
});

describe("STORY_REVEALED", () => {
  function revealState(): Room {
    let game = createLobbyWith(4);
    game = gameReducer(game, {
      type: "GAME_STARTED",
      hostId: "host",
      timestamp: 2000,
    });
    for (let round = 0; round < 7; round++) {
      game = gameReducer(game, {
        type: "HOST_ADVANCED",
        hostId: "host",
        timestamp: 3000 + round,
      });
    }
    return game;
  }

  it("marks a story as revealed", () => {
    let game = revealState();
    game = gameReducer(game, {
      type: "STORY_REVEALED",
      storyIndex: 0,
      timestamp: 5000,
    });
    expect(game.stories[0].isRevealed).toBe(true);
    expect(game.state).toBe("REVEAL");
  });

  it("transitions to END when all stories are revealed", () => {
    let game = revealState();
    for (let i = 0; i < game.stories.length; i++) {
      game = gameReducer(game, {
        type: "STORY_REVEALED",
        storyIndex: i,
        timestamp: 5000 + i,
      });
    }
    expect(game.state).toBe("END");
  });
});

describe("GAME_ENDED", () => {
  it("transitions an active game (PLAYING) to END", () => {
    let room = createLobbyWith(4);
    room = gameReducer(room, {
      type: "GAME_STARTED",
      hostId: "host",
      timestamp: 2000,
    });
    expect(room.state).toBe("PLAYING");

    const next = gameReducer(room, {
      type: "GAME_ENDED",
      timestamp: 9000,
    });
    expect(next.state).toBe("END");
  });

  it("is a no-op from a non-active state (LOBBY)", () => {
    const room = createLobbyWith(4);
    const next = gameReducer(room, {
      type: "GAME_ENDED",
      timestamp: 9000,
    });
    // GAME_ENDED is only valid from PLAYING/REVEAL — from LOBBY it must not
    // transition and should return the same reference.
    expect(next).toBe(room);
    expect(next.state).toBe("LOBBY");
  });
});

describe("Happy path: full game flow", () => {
  it("completes a full game from lobby to end", () => {
    // Create room with 5 players
    let game = createLobbyWith(5);
    expect(game.state).toBe("LOBBY");
    expect(game.players).toHaveLength(5);

    // Start game
    game = gameReducer(game, {
      type: "GAME_STARTED",
      hostId: "host",
      timestamp: 2000,
    });
    expect(game.state).toBe("PLAYING");
    expect(game.stories).toHaveLength(5);

    // Play all 7 rounds
    for (let round = 0; round < 7; round++) {
      for (const story of game.stories) {
        const slot = story.slots[round];
        game = gameReducer(game, {
          type: "PROMPT_SUBMITTED",
          playerId: slot.playerId!,
          storyIndex: story.index,
          promptIndex: round,
          response: `Story ${story.index} Round ${round}`,
        });
      }
    }

    expect(game.state).toBe("REVEAL");

    // Reveal all stories
    for (let i = 0; i < game.stories.length; i++) {
      game = gameReducer(game, {
        type: "STORY_REVEALED",
        storyIndex: i,
        timestamp: 6000 + i,
      });
    }

    expect(game.state).toBe("END");
  });
});
