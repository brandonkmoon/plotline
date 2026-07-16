import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Room, Player } from "@/lib/game/types";
import type { ClientMessage, ServerMessage } from "@/lib/multiplayer/types";
import { PROTOCOL_VERSION } from "@/lib/multiplayer/types";
import { createRoom, gameReducer } from "@/lib/game";
import RoomServer from "@/partykit/room";

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

  describe("HOST_ADVANCE with partial submissions", () => {
    it("should fill placeholders for unsubmitted players and advance to next round", () => {
      let room = makeLobbyWith4Players();
      room = gameReducer(room, {
        type: "GAME_STARTED",
        hostId: "p1",
        timestamp: Date.now(),
      });

      expect(room.state).toBe("PLAYING");
      expect(room.currentRound).toBe(0);
      expect(room.stories).toHaveLength(4);

      // Submit prompts for 3 of 4 stories in round 0, leaving 1 unsubmitted
      const submittedStories = room.stories.slice(0, 3);
      for (const story of submittedStories) {
        const slot = story.slots[0];
        room = gameReducer(room, {
          type: "PROMPT_SUBMITTED",
          playerId: slot.playerId!,
          storyIndex: story.index,
          promptIndex: 0,
          response: `response for story ${story.index}`,
        });
      }

      // Round should NOT have advanced yet (only 3 of 4 submitted)
      expect(room.currentRound).toBe(0);

      // Host advances
      room = gameReducer(room, {
        type: "HOST_ADVANCED",
        hostId: "p1",
        timestamp: Date.now(),
      });

      // Should now be on round 1
      expect(room.currentRound).toBe(1);
      expect(room.state).toBe("PLAYING");

      // Verify all stories and slots are defined
      expect(room.stories).toBeDefined();
      for (const story of room.stories) {
        expect(story).toBeDefined();
        expect(story.slots).toBeDefined();

        const round0Slot = story.slots[0];
        expect(round0Slot).toBeDefined();
        expect(round0Slot.response).not.toBeNull();
      }

      // The unsubmitted story (index 3) should have a placeholder
      const unsubmittedStory = room.stories[3];
      expect(unsubmittedStory.slots[0].response).not.toBeNull();
      expect(unsubmittedStory.slots[0].isPlaceholder).toBe(true);

      // The submitted stories should NOT have placeholders
      for (let i = 0; i < 3; i++) {
        expect(room.stories[i].slots[0].isPlaceholder).toBe(false);
      }
    });

    it("should transition to REVEAL when host advances on the last round", () => {
      let room = makeLobbyWith4Players();
      room = gameReducer(room, {
        type: "GAME_STARTED",
        hostId: "p1",
        timestamp: Date.now(),
      });

      // Complete rounds 0-5 normally
      for (let round = 0; round < 6; round++) {
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

      expect(room.currentRound).toBe(6);

      // Submit 3 of 4 for round 6, leave 1 unsubmitted
      const submittedStories = room.stories.slice(0, 3);
      for (const story of submittedStories) {
        const slot = story.slots[6];
        room = gameReducer(room, {
          type: "PROMPT_SUBMITTED",
          playerId: slot.playerId!,
          storyIndex: story.index,
          promptIndex: 6,
          response: `final response for story ${story.index}`,
        });
      }

      expect(room.currentRound).toBe(6);
      expect(room.state).toBe("PLAYING");

      // Host advances on the last round
      room = gameReducer(room, {
        type: "HOST_ADVANCED",
        hostId: "p1",
        timestamp: Date.now(),
      });

      // Should transition to REVEAL
      expect(room.state).toBe("REVEAL");

      // Verify all stories and all slots are defined and filled
      expect(room.stories).toBeDefined();
      for (const story of room.stories) {
        expect(story).toBeDefined();
        expect(story.slots).toBeDefined();
        for (const slot of story.slots) {
          expect(slot).toBeDefined();
          expect(slot.response).not.toBeNull();
        }
      }

      // The unsubmitted story's last slot should be a placeholder
      const unsubmittedStory = room.stories[3];
      expect(unsubmittedStory.slots[6].isPlaceholder).toBe(true);
    });
  });
});

// -----------------------------------------------------------------------------
// Full server instance tests — simulate connections via onMessage / onClose
// and inspect outgoing messages / internal state.
// -----------------------------------------------------------------------------

interface MockConnection {
  id: string;
  sentMessages: ServerMessage[];
  closeCalled: boolean;
  send: (data: string) => void;
  close: () => void;
}

function makeMockConnection(id: string): MockConnection {
  const conn: MockConnection = {
    id,
    sentMessages: [],
    closeCalled: false,
    send(data: string) {
      try {
        conn.sentMessages.push(JSON.parse(data) as ServerMessage);
      } catch {
        // ignore
      }
    },
    close() {
      conn.closeCalled = true;
    },
  };
  return conn;
}

function makeMockPartyRoom(id: string, connections: Map<string, MockConnection>) {
  return {
    id,
    getConnections() {
      return connections.values();
    },
    getConnection(connId: string) {
      return connections.get(connId);
    },
    storage: {
      get: async () => null,
      put: async () => {},
      deleteAll: async () => {},
    },
  } as any;
}

function makeServer(roomCode = "TEST") {
  const connections = new Map<string, MockConnection>();
  const server = new RoomServer({} as any, {} as any);
  // Inject the mock room facade; the real ctx/env are never used in unit tests.
  (server as any).room = makeMockPartyRoom(roomCode, connections);
  return { server, connections };
}

// partyserver's onMessage is (connection, message); these tests were written
// against PartyKit's (message, connection) order. This adapter keeps the many
// existing call sites unchanged.
function deliver(server: RoomServer, message: string, conn: MockConnection) {
  server["onMessage"](conn as any, message);
}

function join(
  server: RoomServer,
  connections: Map<string, MockConnection>,
  connectionId: string,
  playerName: string,
  opts: { playerId?: string; protocolVersion?: number } = {}
): MockConnection {
  const conn = makeMockConnection(connectionId);
  connections.set(connectionId, conn);
  const msg: ClientMessage = {
    type: "JOIN_ROOM",
    playerName,
    protocolVersion: opts.protocolVersion ?? PROTOCOL_VERSION,
    ...(opts.playerId !== undefined ? { playerId: opts.playerId } : {}),
  };
  deliver(server, JSON.stringify(msg), conn as any);
  return conn;
}

function getLatestStateUpdate(conn: MockConnection) {
  for (let i = conn.sentMessages.length - 1; i >= 0; i--) {
    const m = conn.sentMessages[i];
    if (m.type === "STATE_UPDATE") return m;
  }
  return null;
}

function startGameViaServer(server: RoomServer, hostConn: MockConnection) {
  deliver(server, JSON.stringify({ type: "START_GAME" }), hostConn as any);
}

describe("RoomServer instance behavior", () => {
  beforeEach(() => {
    // Prevent real fetch from running if archive triggers
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 })
    );
  });

  describe("Protocol version", () => {
    it("rejects client with wrong protocol version", () => {
      const { server, connections } = makeServer();
      const conn = join(server, connections, "c1", "Alice", {
        protocolVersion: 1,
      });

      const err = conn.sentMessages.find((m) => m.type === "ERROR");
      expect(err).toBeDefined();
      expect((err as any).reason).toBe("PROTOCOL_MISMATCH");
      expect(conn.closeCalled).toBe(true);
    });

    it("accepts client with correct protocol version", () => {
      const { server, connections } = makeServer();
      const conn = join(server, connections, "c1", "Alice");

      const update = getLatestStateUpdate(conn);
      expect(update).not.toBeNull();
      expect((update as any).protocolVersion).toBe(PROTOCOL_VERSION);
    });
  });

  describe("STATE_UPDATE fields", () => {
    it("includes roundDurationMs, pendingConnected, pendingDisconnected, protocolVersion", () => {
      const { server, connections } = makeServer();
      const conn = join(server, connections, "c1", "Alice");
      const update = getLatestStateUpdate(conn);
      expect(update).not.toBeNull();
      const u = update as Extract<ServerMessage, { type: "STATE_UPDATE" }>;
      expect(u.roundDurationMs).toBe(90_000);
      expect(u.pendingConnected).toBe(0);
      expect(u.pendingDisconnected).toBe(0);
      expect(u.protocolVersion).toBe(PROTOCOL_VERSION);
    });

    it("sets roundStartedAt when game starts", () => {
      const { server, connections } = makeServer();
      const host = join(server, connections, "c1", "Alice");
      const p2 = join(server, connections, "c2", "Bob");
      const p3 = join(server, connections, "c3", "Carol");
      const p4 = join(server, connections, "c4", "Dave");

      startGameViaServer(server, host);

      const update = getLatestStateUpdate(host);
      expect(update).not.toBeNull();
      const u = update as Extract<ServerMessage, { type: "STATE_UPDATE" }>;
      expect(u.room.state).toBe("PLAYING");
      expect(u.roundStartedAt).not.toBeNull();
      expect(typeof u.roundStartedAt).toBe("number");
    });
  });

  describe("Reconnection", () => {
    it("rejects joining with unknown playerId", () => {
      const { server, connections } = makeServer();
      // First player establishes the room
      join(server, connections, "c1", "Alice");

      // New connection tries to reconnect with random player id
      const rogue = join(server, connections, "c2", "Ghost", {
        playerId: "this-id-does-not-exist",
      });

      const err = rogue.sentMessages.find((m) => m.type === "ERROR");
      expect(err).toBeDefined();
      expect((err as any).reason).toBe("UNKNOWN_PLAYER");
      expect(rogue.closeCalled).toBe(true);
    });

    it("restores player on reconnect by playerId and preserves submissions", () => {
      const { server, connections } = makeServer();
      const host = join(server, connections, "c1", "Alice");
      const p2 = join(server, connections, "c2", "Bob");
      const p3 = join(server, connections, "c3", "Carol");
      const p4 = join(server, connections, "c4", "Dave");

      // Extract assigned playerIds from state update
      const update = getLatestStateUpdate(host) as Extract<
        ServerMessage,
        { type: "STATE_UPDATE" }
      >;
      const roomState = update.room;
      const aliceId = roomState.players.find((p) => p.name === "Alice")!.id;
      const bobId = roomState.players.find((p) => p.name === "Bob")!.id;

      startGameViaServer(server, host);

      // Find the story/slot where Alice is assigned in round 0
      const afterStart = getLatestStateUpdate(host) as Extract<
        ServerMessage,
        { type: "STATE_UPDATE" }
      >;
      const aliceSlot = afterStart.room.stories
        .flatMap((s) => s.slots)
        .find((sl) => sl.promptIndex === 0 && sl.playerId === aliceId);
      expect(aliceSlot).toBeDefined();

      // Alice submits
      deliver(server, 
        JSON.stringify({
          type: "SUBMIT_PROMPT",
          storyIndex: aliceSlot!.storyIndex,
          promptIndex: 0,
          response: "alice's answer",
        }),
        host as any
      );

      // Simulate Alice disconnecting
      server.onClose(host as any);
      connections.delete("c1");

      // Alice reconnects with her playerId
      const reconn = join(server, connections, "c1b", "Alice", {
        playerId: aliceId,
      });

      // Should receive a STATE_UPDATE (not an ERROR)
      const err = reconn.sentMessages.find((m) => m.type === "ERROR");
      expect(err).toBeUndefined();
      const reconnUpdate = getLatestStateUpdate(reconn) as Extract<
        ServerMessage,
        { type: "STATE_UPDATE" }
      >;
      expect(reconnUpdate).not.toBeNull();

      // Alice's submission should still be present
      const aliceSlotAfter = reconnUpdate.room.stories
        .flatMap((s) => s.slots)
        .find((sl) => sl.promptIndex === 0 && sl.playerId === aliceId);
      expect(aliceSlotAfter?.response).toBe("alice's answer");

      // Alice should be marked as connected
      const alicePlayer = reconnUpdate.room.players.find(
        (p) => p.id === aliceId
      );
      expect(alicePlayer?.isConnected).toBe(true);
    });
  });

  describe("Multi-tab / per-tab identity", () => {
    it("two clients joining the same room without playerId become distinct players", () => {
      const { server, connections } = makeServer();
      const tab1 = join(server, connections, "tab1", "Alice");
      const tab2 = join(server, connections, "tab2", "Bob");

      const u1 = getLatestStateUpdate(tab1) as Extract<
        ServerMessage,
        { type: "STATE_UPDATE" }
      >;
      const u2 = getLatestStateUpdate(tab2) as Extract<
        ServerMessage,
        { type: "STATE_UPDATE" }
      >;

      expect(u1).not.toBeNull();
      expect(u2).not.toBeNull();
      expect(u1.playerId).not.toBe(u2.playerId);
      expect(u2.room.players.length).toBe(2);

      const names = u2.room.players.map((p) => p.name).sort();
      expect(names).toEqual(["Alice", "Bob"]);
    });

    it("rejects a second active connection trying to reconnect with the same playerId", () => {
      const { server, connections } = makeServer();
      const tab1 = join(server, connections, "tab1", "Alice");

      const u1 = getLatestStateUpdate(tab1) as Extract<
        ServerMessage,
        { type: "STATE_UPDATE" }
      >;
      const aliceId = u1.playerId;

      // Tab 2 (still in same browser) tries to reconnect with Alice's id
      // while tab 1 is still actively connected.
      const tab2 = join(server, connections, "tab2", "Alice", {
        playerId: aliceId,
      });

      const err = tab2.sentMessages.find((m) => m.type === "ERROR");
      expect(err).toBeDefined();
      expect((err as any).reason).toBe("PLAYER_ALREADY_CONNECTED");
      expect(tab2.closeCalled).toBe(true);

      // Tab 1 still has only one player in its view
      const tab1After = getLatestStateUpdate(tab1) as Extract<
        ServerMessage,
        { type: "STATE_UPDATE" }
      >;
      expect(tab1After.room.players.length).toBe(1);
    });

    it("allows reconnect with same playerId after the original socket closes", () => {
      const { server, connections } = makeServer();
      const tab1 = join(server, connections, "tab1", "Alice");

      const u1 = getLatestStateUpdate(tab1) as Extract<
        ServerMessage,
        { type: "STATE_UPDATE" }
      >;
      const aliceId = u1.playerId;

      // Original socket closes (e.g., tab refresh)
      server.onClose(tab1 as any);
      connections.delete("tab1");

      // Reconnect succeeds
      const reconn = join(server, connections, "tab1b", "Alice", {
        playerId: aliceId,
      });

      const err = reconn.sentMessages.find((m) => m.type === "ERROR");
      expect(err).toBeUndefined();
      const after = getLatestStateUpdate(reconn) as Extract<
        ServerMessage,
        { type: "STATE_UPDATE" }
      >;
      expect(after.playerId).toBe(aliceId);
    });
  });

  describe("Pending players when game is in progress", () => {
    it("adds a new joiner to pendingPlayers when state is PLAYING", () => {
      const { server, connections } = makeServer();
      const host = join(server, connections, "c1", "Alice");
      join(server, connections, "c2", "Bob");
      join(server, connections, "c3", "Carol");
      join(server, connections, "c4", "Dave");
      startGameViaServer(server, host);

      // Confirm we're in PLAYING
      const update = getLatestStateUpdate(host) as Extract<
        ServerMessage,
        { type: "STATE_UPDATE" }
      >;
      expect(update.room.state).toBe("PLAYING");

      // New player tries to join
      const newcomer = join(server, connections, "c5", "Eve");

      // No error, a STATE_UPDATE with a pendingPlayers entry for Eve
      const err = newcomer.sentMessages.find((m) => m.type === "ERROR");
      expect(err).toBeUndefined();
      expect(newcomer.closeCalled).toBe(false);

      const newcomerUpdate = getLatestStateUpdate(newcomer) as Extract<
        ServerMessage,
        { type: "STATE_UPDATE" }
      >;
      expect(newcomerUpdate).not.toBeNull();
      const pending = newcomerUpdate.room.pendingPlayers ?? [];
      expect(pending.length).toBe(1);
      expect(pending[0].name).toBe("Eve");
      expect(pending[0].ready).toBe(false);
      // The newcomer's playerId equals the pending player id
      expect(newcomerUpdate.playerId).toBe(pending[0].id);

      // Active players list did not gain Eve
      expect(newcomerUpdate.room.players.length).toBe(4);
    });
  });

  describe("pendingConnected / pendingDisconnected counts", () => {
    it("starts at (4, 0) and decrements pendingConnected as submissions arrive", () => {
      const { server, connections } = makeServer();
      const host = join(server, connections, "c1", "Alice");
      const c2 = join(server, connections, "c2", "Bob");
      const c3 = join(server, connections, "c3", "Carol");
      const c4 = join(server, connections, "c4", "Dave");
      startGameViaServer(server, host);

      let update = getLatestStateUpdate(host) as Extract<
        ServerMessage,
        { type: "STATE_UPDATE" }
      >;
      expect(update.room.state).toBe("PLAYING");
      expect(update.pendingConnected).toBe(4);
      expect(update.pendingDisconnected).toBe(0);

      const players = update.room.players;
      const byName: Record<string, string> = {};
      for (const p of players) byName[p.name] = p.id;

      // Map player -> their connection
      const connByPlayerId: Record<string, MockConnection> = {
        [byName["Alice"]]: host,
        [byName["Bob"]]: c2,
        [byName["Carol"]]: c3,
        [byName["Dave"]]: c4,
      };

      // Submit one player at a time and check pendingConnected decreases
      const stories = update.room.stories;
      let expected = 4;
      for (const story of stories) {
        const slot = story.slots.find(
          (s) => s.promptIndex === update.room.currentRound
        )!;
        const conn = connByPlayerId[slot.playerId!];
        deliver(server, 
          JSON.stringify({
            type: "SUBMIT_PROMPT",
            storyIndex: story.index,
            promptIndex: update.room.currentRound,
            response: `answer for ${slot.playerId}`,
          }),
          conn as any
        );
        expected--;
        // After all 4 submit, the round auto-advances, so pendingConnected
        // will reset to 4 for the new round. Check the intermediate state.
        const latest = getLatestStateUpdate(host) as Extract<
          ServerMessage,
          { type: "STATE_UPDATE" }
        >;
        if (expected > 0) {
          expect(latest.pendingConnected).toBe(expected);
          expect(latest.pendingDisconnected).toBe(0);
        } else {
          // Round auto-advanced to round 1; pending is reset to 4
          expect(latest.room.currentRound).toBe(1);
          expect(latest.pendingConnected).toBe(4);
          expect(latest.pendingDisconnected).toBe(0);
        }
      }
    });

    it("counts disconnected players as pendingDisconnected", async () => {
      const { server, connections } = makeServer();
      const host = join(server, connections, "c1", "Alice");
      const c2 = join(server, connections, "c2", "Bob");
      const c3 = join(server, connections, "c3", "Carol");
      const c4 = join(server, connections, "c4", "Dave");
      startGameViaServer(server, host);

      let update = getLatestStateUpdate(host) as Extract<
        ServerMessage,
        { type: "STATE_UPDATE" }
      >;
      const players = update.room.players;
      const byName: Record<string, string> = {};
      for (const p of players) byName[p.name] = p.id;

      // Map assigned player -> connection
      const connByPlayerId: Record<string, MockConnection> = {
        [byName["Alice"]]: host,
        [byName["Bob"]]: c2,
        [byName["Carol"]]: c3,
        [byName["Dave"]]: c4,
      };

      // 2 players submit (Alice, Bob). Carol stays unsubmitted but connected.
      // Dave disconnects and stays unsubmitted.
      const stories = update.room.stories;

      // Find slot for Alice in round 0
      const aliceStory = stories.find((s) =>
        s.slots.some(
          (sl) => sl.promptIndex === 0 && sl.playerId === byName["Alice"]
        )
      )!;
      deliver(server, 
        JSON.stringify({
          type: "SUBMIT_PROMPT",
          storyIndex: aliceStory.index,
          promptIndex: 0,
          response: "alice",
        }),
        host as any
      );

      const bobStory = stories.find((s) =>
        s.slots.some(
          (sl) => sl.promptIndex === 0 && sl.playerId === byName["Bob"]
        )
      )!;
      deliver(server, 
        JSON.stringify({
          type: "SUBMIT_PROMPT",
          storyIndex: bobStory.index,
          promptIndex: 0,
          response: "bob",
        }),
        c2 as any
      );

      // Dave disconnects — mark his connection closed via onClose and flip
      // isConnected in the game state by using the internal disconnect path.
      // We have to manually mark via onClose and then force the timeout to
      // fire by directly calling handlePlayerDisconnected. But that's a
      // private method. Instead, simulate the "player is disconnected"
      // aspect by calling onClose and then setting vi timers.
      server.onClose(c4 as any);
      connections.delete("c4");

      // Directly flip isConnected in gameState as handlePlayerDisconnected
      // would do after the timeout. We want to inspect what the server
      // would report if the player were already in disconnected state.
      (server as any).gameState = {
        ...(server as any).gameState,
        players: (server as any).gameState.players.map((p: Player) =>
          p.id === byName["Dave"] ? { ...p, isConnected: false } : p
        ),
      };

      // Trigger a broadcast by having Carol send a typing status (doesn't
      // change game state, but also doesn't force a broadcastStateUpdate).
      // Use host->host status instead to force a state broadcast. We can
      // directly call broadcastStateUpdate via a no-op action such as
      // reconnecting (just ensure a state broadcast happens). Simplest:
      // call the private method directly.
      (server as any).broadcastStateUpdate();

      const latest = getLatestStateUpdate(host) as Extract<
        ServerMessage,
        { type: "STATE_UPDATE" }
      >;
      expect(latest.pendingConnected).toBe(1); // Carol
      expect(latest.pendingDisconnected).toBe(1); // Dave
    });
  });

  describe("Broadcast targeting (every state-mutating handler reaches all clients)", () => {
    function countStateUpdatesAfter(conn: MockConnection, baseline: number) {
      return conn.sentMessages
        .slice(baseline)
        .filter((m) => m.type === "STATE_UPDATE").length;
    }

    it("STATE_UPDATE on JOIN reaches every previously-connected client", () => {
      const { server, connections } = makeServer();

      // Player 1 joins
      const c1 = join(server, connections, "c1", "Alice");
      const c1AfterJoin1 = c1.sentMessages.length;

      // Player 2 joins — c1 should receive a STATE_UPDATE about player 2
      const c2 = join(server, connections, "c2", "Bob");
      expect(countStateUpdatesAfter(c1, c1AfterJoin1)).toBeGreaterThan(0);
      const c1Last = getLatestStateUpdate(c1) as Extract<
        ServerMessage,
        { type: "STATE_UPDATE" }
      >;
      expect(c1Last.room.players.length).toBe(2);

      const c1AfterJoin2 = c1.sentMessages.length;
      const c2AfterJoin2 = c2.sentMessages.length;

      // Player 3 joins — both c1 and c2 should receive STATE_UPDATE
      const c3 = join(server, connections, "c3", "Carol");
      expect(countStateUpdatesAfter(c1, c1AfterJoin2)).toBeGreaterThan(0);
      expect(countStateUpdatesAfter(c2, c2AfterJoin2)).toBeGreaterThan(0);

      const c1AfterJoin3 = c1.sentMessages.length;
      const c2AfterJoin3 = c2.sentMessages.length;
      const c3AfterJoin3 = c3.sentMessages.length;

      // Player 4 joins — all three previous should receive STATE_UPDATE
      const c4 = join(server, connections, "c4", "Dave");
      expect(countStateUpdatesAfter(c1, c1AfterJoin3)).toBeGreaterThan(0);
      expect(countStateUpdatesAfter(c2, c2AfterJoin3)).toBeGreaterThan(0);
      expect(countStateUpdatesAfter(c3, c3AfterJoin3)).toBeGreaterThan(0);

      // Final state: every client sees 4 players
      const c1Final = getLatestStateUpdate(c1) as Extract<
        ServerMessage,
        { type: "STATE_UPDATE" }
      >;
      const c2Final = getLatestStateUpdate(c2) as Extract<
        ServerMessage,
        { type: "STATE_UPDATE" }
      >;
      const c3Final = getLatestStateUpdate(c3) as Extract<
        ServerMessage,
        { type: "STATE_UPDATE" }
      >;
      const c4Final = getLatestStateUpdate(c4) as Extract<
        ServerMessage,
        { type: "STATE_UPDATE" }
      >;
      expect(c1Final.room.players.length).toBe(4);
      expect(c2Final.room.players.length).toBe(4);
      expect(c3Final.room.players.length).toBe(4);
      expect(c4Final.room.players.length).toBe(4);

      // All four clients see identical player list
      const names = (u: typeof c1Final) =>
        u.room.players.map((p) => p.name).sort();
      expect(names(c2Final)).toEqual(names(c1Final));
      expect(names(c3Final)).toEqual(names(c1Final));
      expect(names(c4Final)).toEqual(names(c1Final));
    });

    it("STATE_UPDATE on SUBMIT_PROMPT reaches every other client with fresh pendingConnected", () => {
      const { server, connections } = makeServer();
      const c1 = join(server, connections, "c1", "Alice");
      const c2 = join(server, connections, "c2", "Bob");
      const c3 = join(server, connections, "c3", "Carol");
      const c4 = join(server, connections, "c4", "Dave");

      startGameViaServer(server, c1);

      // Initial pending = 4 (no one has submitted)
      const initial = getLatestStateUpdate(c2) as Extract<
        ServerMessage,
        { type: "STATE_UPDATE" }
      >;
      expect(initial.pendingConnected).toBe(4);

      // Find Alice's slot for round 0
      const aliceId = initial.room.players.find((p) => p.name === "Alice")!.id;
      const aliceSlot = initial.room.stories
        .flatMap((s) => s.slots)
        .find((sl) => sl.promptIndex === 0 && sl.playerId === aliceId);
      expect(aliceSlot).toBeDefined();

      const c2Before = c2.sentMessages.length;
      const c3Before = c3.sentMessages.length;
      const c4Before = c4.sentMessages.length;

      // Alice submits
      deliver(server, 
        JSON.stringify({
          type: "SUBMIT_PROMPT",
          storyIndex: aliceSlot!.storyIndex,
          promptIndex: 0,
          response: "alice's answer",
        }),
        c1 as any
      );

      // Every other client should receive a STATE_UPDATE with pendingConnected === 3
      expect(countStateUpdatesAfter(c2, c2Before)).toBeGreaterThan(0);
      expect(countStateUpdatesAfter(c3, c3Before)).toBeGreaterThan(0);
      expect(countStateUpdatesAfter(c4, c4Before)).toBeGreaterThan(0);

      const c2After = getLatestStateUpdate(c2) as Extract<
        ServerMessage,
        { type: "STATE_UPDATE" }
      >;
      const c3After = getLatestStateUpdate(c3) as Extract<
        ServerMessage,
        { type: "STATE_UPDATE" }
      >;
      const c4After = getLatestStateUpdate(c4) as Extract<
        ServerMessage,
        { type: "STATE_UPDATE" }
      >;
      expect(c2After.pendingConnected).toBe(3);
      expect(c3After.pendingConnected).toBe(3);
      expect(c4After.pendingConnected).toBe(3);
    });
  });

  // Helper: drive a 4-player game all the way into REVEAL, returning the
  // server plus the four connections and a name->id map.
  function gameIntoReveal() {
    const { server, connections } = makeServer();
    const c1 = join(server, connections, "c1", "Alice");
    const c2 = join(server, connections, "c2", "Bob");
    const c3 = join(server, connections, "c3", "Carol");
    const c4 = join(server, connections, "c4", "Dave");
    startGameViaServer(server, c1);

    const update = getLatestStateUpdate(c1) as Extract<
      ServerMessage,
      { type: "STATE_UPDATE" }
    >;
    const byName: Record<string, string> = {};
    for (const p of update.room.players) byName[p.name] = p.id;
    const connByPlayerId: Record<string, MockConnection> = {
      [byName["Alice"]]: c1,
      [byName["Bob"]]: c2,
      [byName["Carol"]]: c3,
      [byName["Dave"]]: c4,
    };

    // Submit every slot across all 7 rounds
    for (let round = 0; round < 7; round++) {
      const u = getLatestStateUpdate(c1) as Extract<
        ServerMessage,
        { type: "STATE_UPDATE" }
      >;
      for (const story of u.room.stories) {
        const slot = story.slots.find((s) => s.promptIndex === round)!;
        const conn = connByPlayerId[slot.playerId!];
        deliver(server, 
          JSON.stringify({
            type: "SUBMIT_PROMPT",
            storyIndex: story.index,
            promptIndex: round,
            response: `r${round}s${story.index}`,
          }),
          conn as any
        );
      }
    }

    return { server, connections, c1, c2, c3, c4, byName };
  }

  describe("Reveal: no auto-advance after 7 lines", () => {
    it("stays in REVEAL on the same story after 7 REVEAL_ADVANCE calls, and 8th is a no-op", () => {
      const { server, c1 } = gameIntoReveal();

      const beforeReveal = getLatestStateUpdate(c1) as Extract<
        ServerMessage,
        { type: "STATE_UPDATE" }
      >;
      expect(beforeReveal.room.state).toBe("REVEAL");

      const revealStart = c1.sentMessages.filter(
        (m) => m.type === "REVEAL_STATE"
      );
      const initialRevealIdx =
        revealStart.length > 0
          ? (revealStart[revealStart.length - 1] as any).storyIndex
          : 0;

      // Find the reader for the current story
      const story = beforeReveal.room.stories[initialRevealIdx];
      const readerSlot = story.slots.find((s) => s.promptIndex === 6)!;
      const readerId = readerSlot.playerId!;

      const nameToConn: Record<string, MockConnection> = {};
      for (const p of beforeReveal.room.players) {
        // Find a MockConnection whose id matches playerToConnection
        const connId = (server as any).playerToConnection.get(p.id);
        if (connId) nameToConn[p.id] = (server as any).room.getConnection(connId);
      }
      const readerConn = nameToConn[readerId];
      expect(readerConn).toBeDefined();

      // Fire 7 REVEAL_ADVANCE calls
      for (let i = 0; i < 7; i++) {
        deliver(server, 
          JSON.stringify({ type: "REVEAL_ADVANCE" }),
          readerConn as any
        );
      }

      // After 7 lines, state is still REVEAL and story hasn't advanced
      const afterSeven = getLatestStateUpdate(c1) as Extract<
        ServerMessage,
        { type: "STATE_UPDATE" }
      >;
      expect(afterSeven.room.state).toBe("REVEAL");
      const stillUnrevealed = afterSeven.room.stories.every(
        (s) => !s.isRevealed
      );
      expect(stillUnrevealed).toBe(true);

      const revealStates = c1.sentMessages.filter(
        (m) => m.type === "REVEAL_STATE"
      );
      const lastReveal = revealStates[revealStates.length - 1] as any;
      expect(lastReveal.revealedCount).toBe(7);
      expect(lastReveal.storyIndex).toBe(initialRevealIdx);

      // 8th call — should be a no-op
      const revealMsgsBefore = c1.sentMessages.filter(
        (m) => m.type === "REVEAL_STATE"
      ).length;
      deliver(server, 
        JSON.stringify({ type: "REVEAL_ADVANCE" }),
        readerConn as any
      );
      const revealMsgsAfter = c1.sentMessages.filter(
        (m) => m.type === "REVEAL_STATE"
      ).length;
      expect(revealMsgsAfter).toBe(revealMsgsBefore);
    });
  });

  describe("SET_READY", () => {
    it("flips the ready flag for a pending player and broadcasts", () => {
      const { server, connections } = makeServer();
      const host = join(server, connections, "c1", "Alice");
      join(server, connections, "c2", "Bob");
      join(server, connections, "c3", "Carol");
      join(server, connections, "c4", "Dave");
      startGameViaServer(server, host);

      const newcomer = join(server, connections, "c5", "Eve");
      const beforeReady = getLatestStateUpdate(newcomer) as Extract<
        ServerMessage,
        { type: "STATE_UPDATE" }
      >;
      expect(beforeReady.room.pendingPlayers?.[0]?.ready).toBe(false);

      deliver(server, 
        JSON.stringify({ type: "SET_READY", ready: true }),
        newcomer as any
      );

      const afterReady = getLatestStateUpdate(host) as Extract<
        ServerMessage,
        { type: "STATE_UPDATE" }
      >;
      const pending = afterReady.room.pendingPlayers ?? [];
      expect(pending.length).toBe(1);
      expect(pending[0].name).toBe("Eve");
      expect(pending[0].ready).toBe(true);
    });
  });

  describe("PLAY_AGAIN promotes ready pending players", () => {
    it("promotes ready pendings to active players and keeps non-ready ones", () => {
      const { server, connections, c1 } = gameIntoReveal();

      // Add two pending players
      const eve = join(server, connections, "c5", "Eve");
      const frank = join(server, connections, "c6", "Frank");

      // Mark Eve as ready, leave Frank not ready
      deliver(server, 
        JSON.stringify({ type: "SET_READY", ready: true }),
        eve as any
      );

      // Transition to END
      deliver(server, 
        JSON.stringify({ type: "END_GAME" }),
        c1 as any
      );

      const atEnd = getLatestStateUpdate(c1) as Extract<
        ServerMessage,
        { type: "STATE_UPDATE" }
      >;
      expect(atEnd.room.state).toBe("END");

      // Host queues for next game, then sends PLAY_AGAIN
      deliver(server, 
        JSON.stringify({ type: "QUEUE_NEXT_GAME" }),
        c1 as any
      );
      deliver(server, 
        JSON.stringify({ type: "PLAY_AGAIN" }),
        c1 as any
      );

      const afterPlayAgain = getLatestStateUpdate(c1) as Extract<
        ServerMessage,
        { type: "STATE_UPDATE" }
      >;
      expect(afterPlayAgain.room.state).toBe("LOBBY");

      const activeNames = afterPlayAgain.room.players.map((p) => p.name).sort();
      expect(activeNames).toContain("Eve");
      expect(activeNames).not.toContain("Frank");

      const remainingPending = afterPlayAgain.room.pendingPlayers ?? [];
      expect(remainingPending.length).toBe(1);
      expect(remainingPending[0].name).toBe("Frank");
      expect(remainingPending[0].ready).toBe(false);
    });
  });

  describe("NEW_ROOM broadcasts ROOM_REDIRECT", () => {
    it("sends ROOM_REDIRECT with a 4-character code to all connections", () => {
      const { server, connections } = makeServer();
      const host = join(server, connections, "c1", "Alice");
      const c2 = join(server, connections, "c2", "Bob");
      const c3 = join(server, connections, "c3", "Carol");
      const c4 = join(server, connections, "c4", "Dave");

      deliver(server, JSON.stringify({ type: "NEW_ROOM" }), host as any);

      for (const conn of [host, c2, c3, c4]) {
        const redirect = conn.sentMessages.find(
          (m) => m.type === "ROOM_REDIRECT"
        ) as any;
        expect(redirect).toBeDefined();
        expect(typeof redirect.newRoomCode).toBe("string");
        expect(redirect.newRoomCode.length).toBe(4);
      }
    });

    it("rejects NEW_ROOM from non-host", () => {
      const { server, connections } = makeServer();
      join(server, connections, "c1", "Alice");
      const c2 = join(server, connections, "c2", "Bob");

      deliver(server, JSON.stringify({ type: "NEW_ROOM" }), c2 as any);

      const err = c2.sentMessages.find((m) => m.type === "ERROR");
      expect(err).toBeDefined();
      const redirect = c2.sentMessages.find((m) => m.type === "ROOM_REDIRECT");
      expect(redirect).toBeUndefined();
    });
  });
});

describe("onConnect identity guard", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "" })
    );
  });

  function ctxFor(roomCode: string, playerId: string) {
    return {
      request: { url: `https://example.com/party/${roomCode}?playerId=${playerId}` },
    } as any;
  }

  it("refuses to rebind a playerId that already has a live connection", () => {
    const { server, connections } = makeServer();
    join(server, connections, "c1", "Alice");
    const pid = server.gameState!.players[0].id;
    expect((server as any).playerToConnection.get(pid)).toBe("c1");

    // A second socket arrives carrying the victim's playerId while c1 is live.
    const attacker = makeMockConnection("c2");
    connections.set("c2", attacker);
    server.onConnect(attacker as any, ctxFor("TEST", pid));

    // The mapping stays on the live original; the attacker isn't bound.
    expect((server as any).playerToConnection.get(pid)).toBe("c1");
    expect((server as any).connectionToPlayer.get("c2")).toBeUndefined();
  });

  it("binds on a genuine reconnect once the prior socket is gone", () => {
    const { server, connections } = makeServer();
    join(server, connections, "c1", "Alice");
    const pid = server.gameState!.players[0].id;

    // Original socket drops.
    connections.delete("c1");

    // Player reconnects on a fresh socket carrying their playerId.
    const rejoin = makeMockConnection("c3");
    connections.set("c3", rejoin);
    server.onConnect(rejoin as any, ctxFor("TEST", pid));

    expect((server as any).playerToConnection.get(pid)).toBe("c3");
    expect((server as any).connectionToPlayer.get("c3")).toBe(pid);
  });
});
