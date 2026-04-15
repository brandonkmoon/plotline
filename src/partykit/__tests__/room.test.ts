import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Room, Player } from "@/lib/game/types";
import type { ClientMessage, ServerMessage } from "@/lib/multiplayer/types";
import { createRoom, gameReducer } from "@/lib/game";

/**
 * Since PartyKit server instances are tightly coupled to the PartyKit runtime,
 * we test the message handling logic by simulating what the server does:
 * parse messages, run them through the reducer, and verify the resulting state.
 *
 * This tests the game logic integration that the room server relies on.
 */

function makePlayer(id: string, name: string, isHost = false): Player {
  return {
    id,
    name,
    isHost,
    isConnected: true,
    joinedAt: Date.now(),
  };
}

function makeLobbyWith4Players(): Room {
  const now = Date.now();
  let room = createRoom("TEST", { id: "p1", name: "Alice" }, now);
  room = gameReducer(room, {
    type: "PLAYER_JOINED",
    player: makePlayer("p2", "Bob"),
  });
  room = gameReducer(room, {
    type: "PLAYER_JOINED",
    player: makePlayer("p3", "Carol"),
  });
  room = gameReducer(room, {
    type: "PLAYER_JOINED",
    player: makePlayer("p4", "Dave"),
  });
  return room;
}

describe("Room Server Logic (integration with reducer)", () => {
  describe("JOIN_ROOM", () => {
    it("should create a room for the first player", () => {
      const room = createRoom("ABCD", { id: "p1", name: "Alice" }, Date.now());
      expect(room.state).toBe("LOBBY");
      expect(room.players).toHaveLength(1);
      expect(room.players[0].name).toBe("Alice");
      expect(room.players[0].isHost).toBe(true);
      expect(room.hostId).toBe("p1");
    });

    it("should add subsequent players via PLAYER_JOINED", () => {
      let room = createRoom("ABCD", { id: "p1", name: "Alice" }, Date.now());
      room = gameReducer(room, {
        type: "PLAYER_JOINED",
        player: makePlayer("p2", "Bob"),
      });

      expect(room.players).toHaveLength(2);
      expect(room.players[1].name).toBe("Bob");
      expect(room.players[1].isHost).toBe(false);
    });

    it("should reject duplicate player IDs", () => {
      let room = createRoom("ABCD", { id: "p1", name: "Alice" }, Date.now());
      const before = room;
      room = gameReducer(room, {
        type: "PLAYER_JOINED",
        player: makePlayer("p1", "Alice Clone"),
      });

      expect(room).toBe(before); // unchanged
      expect(room.players).toHaveLength(1);
    });

    it("should reject joins when not in LOBBY state", () => {
      let room = makeLobbyWith4Players();
      room = gameReducer(room, {
        type: "GAME_STARTED",
        hostId: "p1",
        timestamp: Date.now(),
      });

      const before = room;
      room = gameReducer(room, {
        type: "PLAYER_JOINED",
        player: makePlayer("p5", "Eve"),
      });

      expect(room).toBe(before); // unchanged
    });
  });

  describe("START_GAME", () => {
    it("should start game when host requests with enough players", () => {
      let room = makeLobbyWith4Players();
      room = gameReducer(room, {
        type: "GAME_STARTED",
        hostId: "p1",
        timestamp: Date.now(),
      });

      expect(room.state).toBe("PLAYING");
      expect(room.stories.length).toBe(4); // one per player
      expect(room.currentRound).toBe(0);
    });

    it("should reject start from non-host", () => {
      let room = makeLobbyWith4Players();
      const before = room;
      room = gameReducer(room, {
        type: "GAME_STARTED",
        hostId: "p2", // not host
        timestamp: Date.now(),
      });

      expect(room).toBe(before);
      expect(room.state).toBe("LOBBY");
    });

    it("should reject start with fewer than 4 players", () => {
      let room = createRoom("TEST", { id: "p1", name: "Alice" }, Date.now());
      room = gameReducer(room, {
        type: "PLAYER_JOINED",
        player: makePlayer("p2", "Bob"),
      });

      const before = room;
      room = gameReducer(room, {
        type: "GAME_STARTED",
        hostId: "p1",
        timestamp: Date.now(),
      });

      expect(room).toBe(before);
      expect(room.state).toBe("LOBBY");
    });
  });

  describe("SUBMIT_PROMPT", () => {
    function startedGame(): Room {
      let room = makeLobbyWith4Players();
      room = gameReducer(room, {
        type: "GAME_STARTED",
        hostId: "p1",
        timestamp: Date.now(),
      });
      return room;
    }

    it("should record a valid submission", () => {
      let room = startedGame();
      const story = room.stories[0];
      const slot = story.slots[0]; // round 0
      const assignedPlayer = slot.playerId!;

      room = gameReducer(room, {
        type: "PROMPT_SUBMITTED",
        playerId: assignedPlayer,
        storyIndex: 0,
        promptIndex: 0,
        response: "test response",
      });

      expect(room.stories[0].slots[0].response).toBe("test response");
    });

    it("should reject submission from wrong player", () => {
      let room = startedGame();
      const story = room.stories[0];
      const slot = story.slots[0];
      const wrongPlayer =
        slot.playerId === "p1" ? "p2" : "p1";

      const before = room;
      room = gameReducer(room, {
        type: "PROMPT_SUBMITTED",
        playerId: wrongPlayer,
        storyIndex: 0,
        promptIndex: 0,
        response: "test response",
      });

      expect(room).toBe(before);
    });

    it("should auto-advance round when all prompts submitted", () => {
      let room = startedGame();
      expect(room.currentRound).toBe(0);

      // Submit all prompts for round 0
      for (const story of room.stories) {
        const slot = story.slots[0];
        room = gameReducer(room, {
          type: "PROMPT_SUBMITTED",
          playerId: slot.playerId!,
          storyIndex: story.index,
          promptIndex: 0,
          response: `response for story ${story.index}`,
        });
      }

      expect(room.currentRound).toBe(1);
    });

    it("should transition to REVEAL after all rounds complete", () => {
      let room = startedGame();

      // Submit all 7 rounds
      for (let round = 0; round < 7; round++) {
        for (const story of room.stories) {
          const slot = story.slots[round];
          room = gameReducer(room, {
            type: "PROMPT_SUBMITTED",
            playerId: slot.playerId!,
            storyIndex: story.index,
            promptIndex: round,
            response: `r${round}s${story.index}`,
          });
        }
      }

      expect(room.state).toBe("REVEAL");
    });
  });

  describe("HOST_ADVANCE", () => {
    it("should fill placeholders for missing submissions and advance", () => {
      let room = makeLobbyWith4Players();
      room = gameReducer(room, {
        type: "GAME_STARTED",
        hostId: "p1",
        timestamp: Date.now(),
      });

      // Submit only some prompts for round 0
      const firstStory = room.stories[0];
      room = gameReducer(room, {
        type: "PROMPT_SUBMITTED",
        playerId: firstStory.slots[0].playerId!,
        storyIndex: 0,
        promptIndex: 0,
        response: "actual response",
      });

      expect(room.currentRound).toBe(0); // not yet advanced

      // Host advances
      room = gameReducer(room, {
        type: "HOST_ADVANCED",
        hostId: "p1",
        timestamp: Date.now(),
      });

      expect(room.currentRound).toBe(1);

      // Check that missing slots got placeholders
      for (let i = 1; i < room.stories.length; i++) {
        const slot = room.stories[i].slots[0];
        expect(slot.response).not.toBeNull();
        expect(slot.isPlaceholder).toBe(true);
      }

      // First story's response should not be a placeholder
      expect(room.stories[0].slots[0].isPlaceholder).toBe(false);
    });
  });

  describe("Host transfer on disconnect", () => {
    it("should transfer host via PLAYER_LEFT", () => {
      let room = makeLobbyWith4Players();

      // Host leaves
      room = gameReducer(room, {
        type: "PLAYER_LEFT",
        playerId: "p1",
      });

      expect(room.hostId).not.toBe("p1");
      expect(room.players).toHaveLength(3);
      const newHost = room.players.find((p) => p.isHost);
      expect(newHost).toBeDefined();
      expect(newHost!.id).toBe(room.hostId);
    });

    it("should destroy room when all players leave", () => {
      let room = createRoom("TEST", { id: "p1", name: "Alice" }, Date.now());

      room = gameReducer(room, {
        type: "PLAYER_LEFT",
        playerId: "p1",
      });

      expect(room.state).toBe("DESTROYED");
      expect(room.players).toHaveLength(0);
    });
  });

  describe("Reconnection", () => {
    it("should allow marking a player as disconnected and reconnected via state manipulation", () => {
      let room = makeLobbyWith4Players();

      // Simulate disconnect by marking player as not connected
      room = {
        ...room,
        players: room.players.map((p) =>
          p.id === "p2" ? { ...p, isConnected: false } : p
        ),
      };

      expect(room.players.find((p) => p.id === "p2")!.isConnected).toBe(false);

      // Simulate reconnect
      room = {
        ...room,
        players: room.players.map((p) =>
          p.id === "p2" ? { ...p, isConnected: true } : p
        ),
      };

      expect(room.players.find((p) => p.id === "p2")!.isConnected).toBe(true);
      expect(room.players).toHaveLength(4); // still 4 players
    });
  });

  describe("STORY_REVEALED", () => {
    it("should reveal stories one by one", () => {
      let room = makeLobbyWith4Players();
      room = gameReducer(room, {
        type: "GAME_STARTED",
        hostId: "p1",
        timestamp: Date.now(),
      });

      // Complete all rounds
      for (let round = 0; round < 7; round++) {
        for (const story of room.stories) {
          const slot = story.slots[round];
          room = gameReducer(room, {
            type: "PROMPT_SUBMITTED",
            playerId: slot.playerId!,
            storyIndex: story.index,
            promptIndex: round,
            response: `r${round}s${story.index}`,
          });
        }
      }

      expect(room.state).toBe("REVEAL");

      // Reveal first story
      room = gameReducer(room, {
        type: "STORY_REVEALED",
        storyIndex: 0,
        timestamp: Date.now(),
      });

      expect(room.stories[0].isRevealed).toBe(true);
      expect(room.stories[1].isRevealed).toBe(false);
      expect(room.state).toBe("REVEAL"); // not all revealed yet
    });

    it("should transition to END when all stories revealed", () => {
      let room = makeLobbyWith4Players();
      room = gameReducer(room, {
        type: "GAME_STARTED",
        hostId: "p1",
        timestamp: Date.now(),
      });

      // Complete all rounds
      for (let round = 0; round < 7; round++) {
        for (const story of room.stories) {
          const slot = story.slots[round];
          room = gameReducer(room, {
            type: "PROMPT_SUBMITTED",
            playerId: slot.playerId!,
            storyIndex: story.index,
            promptIndex: round,
            response: `r${round}s${story.index}`,
          });
        }
      }

      // Reveal all stories
      for (let i = 0; i < room.stories.length; i++) {
        room = gameReducer(room, {
          type: "STORY_REVEALED",
          storyIndex: i,
          timestamp: Date.now(),
        });
      }

      expect(room.state).toBe("END");
    });
  });

  describe("GAME_ENDED", () => {
    it("should transition to END state", () => {
      let room = makeLobbyWith4Players();
      room = gameReducer(room, {
        type: "GAME_STARTED",
        hostId: "p1",
        timestamp: Date.now(),
      });

      room = gameReducer(room, {
        type: "GAME_ENDED",
        timestamp: Date.now(),
      });

      expect(room.state).toBe("END");
    });
  });
});
