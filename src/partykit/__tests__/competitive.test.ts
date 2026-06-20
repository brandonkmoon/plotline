import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ServerMessage, ClientMessage } from "@/lib/multiplayer/types";
import { PROTOCOL_VERSION } from "@/lib/multiplayer/types";
import RoomServer from "@/partykit/room";

// ── Mocks ──

interface MockConnection {
  id: string;
  sentMessages: ServerMessage[];
  closeCalled: boolean;
  send(data: string): void;
  close(): void;
}

function makeMockConnection(id: string): MockConnection {
  const conn: MockConnection = {
    id,
    sentMessages: [],
    closeCalled: false,
    send(data: string) {
      try { conn.sentMessages.push(JSON.parse(data)); } catch {}
    },
    close() { conn.closeCalled = true; },
  };
  return conn;
}

function makeMockPartyRoom(id: string, connections: Map<string, MockConnection>) {
  return {
    id,
    env: {},
    getConnections: () => connections.values(),
    getConnection: (connId: string) => connections.get(connId),
    storage: { get: async () => null, put: async () => {}, deleteAll: async () => {} },
  } as any;
}

function makeServer(roomCode = "TEST") {
  const connections = new Map<string, MockConnection>();
  const mockRoom = makeMockPartyRoom(roomCode, connections);
  const server = new RoomServer(mockRoom);
  return { server, connections };
}

function join(
  server: RoomServer,
  connections: Map<string, MockConnection>,
  connectionId: string,
  playerName: string,
  opts: { isPremium?: boolean } = {}
): MockConnection {
  const conn = makeMockConnection(connectionId);
  connections.set(connectionId, conn);
  server.onMessage(JSON.stringify({
    type: "JOIN_ROOM",
    playerName,
    protocolVersion: PROTOCOL_VERSION,
    ...(opts.isPremium ? { isPremium: true } : {}),
  }), conn as any);
  return conn;
}

function getLatestStateUpdate(conn: MockConnection) {
  for (let i = conn.sentMessages.length - 1; i >= 0; i--) {
    if (conn.sentMessages[i].type === "STATE_UPDATE") return conn.sentMessages[i] as any;
  }
  return null;
}

function getMessages(conn: MockConnection, type: string) {
  return conn.sentMessages.filter((m) => m.type === type);
}

function startCompetitive(server: RoomServer, hostConn: MockConnection, seriesLength: number = 3) {
  server.onMessage(JSON.stringify({
    type: "START_GAME",
    mode: "competitive",
    seriesLength,
  }), hostConn as any);
}

/** Play all 7 rounds — submit every slot with deterministic responses */
function playAllRounds(
  server: RoomServer,
  hostConn: MockConnection,
  connections: Map<string, MockConnection>
) {
  const update = getLatestStateUpdate(hostConn);
  const connByPlayerId: Record<string, MockConnection> = {};
  for (const p of update.room.players) {
    for (const [, conn] of connections) {
      const u = getLatestStateUpdate(conn);
      if (u?.playerId === p.id) { connByPlayerId[p.id] = conn; break; }
    }
  }

  for (let round = 0; round < 7; round++) {
    const u = getLatestStateUpdate(hostConn);
    for (const story of u.room.stories) {
      const slot = story.slots.find((s: any) => s.promptIndex === round);
      if (!slot?.playerId) continue;
      const conn = connByPlayerId[slot.playerId];
      if (!conn) continue;
      const response = round <= 1
        ? `Player${slot.playerId} — a character`
        : `response-r${round}-s${story.index}`;
      server.onMessage(JSON.stringify({
        type: "SUBMIT_PROMPT",
        storyIndex: story.index,
        promptIndex: round,
        response,
      }), conn as any);
    }
  }

  return connByPlayerId;
}

/** Reveal all stories: for each story, reveal 7 lines, vote, advance */
function revealAllStories(
  server: RoomServer,
  hostConn: MockConnection,
  storyCount: number
) {
  for (let s = 0; s < storyCount; s++) {
    // Reveal 7 lines one at a time
    for (let line = 0; line < 7; line++) {
      server.onMessage(JSON.stringify({ type: "REVEAL_ADVANCE" }), hostConn as any);
    }
    // In competitive: start voting then advance voting
    server.onMessage(JSON.stringify({ type: "START_VOTING" }), hostConn as any);
    server.onMessage(JSON.stringify({ type: "ADVANCE_VOTING" }), hostConn as any);
  }
}

// ── Tests ──

describe("Competitive mode server tests", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
  });

  describe("Starting competitive mode", () => {
    it("sets gameMode to competitive and initializes series state", () => {
      const { server, connections } = makeServer();
      const c1 = join(server, connections, "c1", "Alice", { isPremium: true });
      join(server, connections, "c2", "Bob");
      join(server, connections, "c3", "Carol");
      join(server, connections, "c4", "Dave");

      startCompetitive(server, c1, 3);

      const u = getLatestStateUpdate(c1);
      expect(u.room.state).toBe("PLAYING");
      expect(u.room.gameMode).toBe("competitive");
      expect(u.room.series).toBeDefined();
      expect(u.room.series.totalGames).toBe(3);
      expect(u.room.series.currentGameNumber).toBe(1);
    });

    it("accepts series length of 1", () => {
      const { server, connections } = makeServer();
      const c1 = join(server, connections, "c1", "Alice", { isPremium: true });
      join(server, connections, "c2", "Bob");
      join(server, connections, "c3", "Carol");
      join(server, connections, "c4", "Dave");

      startCompetitive(server, c1, 1);

      const u = getLatestStateUpdate(c1);
      expect(u.room.series.totalGames).toBe(1);
    });

    it("accepts series length of 5", () => {
      const { server, connections } = makeServer();
      const c1 = join(server, connections, "c1", "Alice", { isPremium: true });
      join(server, connections, "c2", "Bob");
      join(server, connections, "c3", "Carol");
      join(server, connections, "c4", "Dave");

      startCompetitive(server, c1, 5);

      const u = getLatestStateUpdate(c1);
      expect(u.room.series.totalGames).toBe(5);
    });
  });

  describe("Voting flow", () => {
    it("allows host to start voting after all lines are revealed", () => {
      const { server, connections } = makeServer();
      const c1 = join(server, connections, "c1", "Alice", { isPremium: true });
      join(server, connections, "c2", "Bob");
      join(server, connections, "c3", "Carol");
      join(server, connections, "c4", "Dave");

      startCompetitive(server, c1);
      playAllRounds(server, c1, connections);

      // Reveal all 7 lines of first story (one at a time)
      for (let i = 0; i < 7; i++) {
        server.onMessage(JSON.stringify({ type: "REVEAL_ADVANCE" }), c1 as any);
      }

      // Start voting
      server.onMessage(JSON.stringify({ type: "START_VOTING" }), c1 as any);

      const votingOpen = getMessages(c1, "VOTING_OPEN");
      expect(votingOpen.length).toBeGreaterThan(0);

      const u = getLatestStateUpdate(c1);
      expect(u.room.votingState).toBeDefined();
      expect(u.room.votingState.phase).toBe("voting");
    });

    it("accepts votes from non-author players", () => {
      const { server, connections } = makeServer();
      const c1 = join(server, connections, "c1", "Alice", { isPremium: true });
      const c2 = join(server, connections, "c2", "Bob");
      join(server, connections, "c3", "Carol");
      join(server, connections, "c4", "Dave");

      startCompetitive(server, c1);
      playAllRounds(server, c1, connections);

      for (let i = 0; i < 7; i++) {
        server.onMessage(JSON.stringify({ type: "REVEAL_ADVANCE" }), c1 as any);
      }
      server.onMessage(JSON.stringify({ type: "START_VOTING" }), c1 as any);

      // Get the story index being voted on from voting state
      const uVoting = getLatestStateUpdate(c1);
      const votingStoryIndex = uVoting.room.votingState.storyIndex;
      const bobId = uVoting.room.players.find((p: any) => p.name === "Bob")?.id;
      const votingStory = uVoting.room.stories[votingStoryIndex];
      // Find a line Bob didn't write
      const votableLine = votingStory.slots.findIndex((s: any) => s.playerId !== bobId);

      // Bob submits a vote
      server.onMessage(JSON.stringify({
        type: "SUBMIT_VOTE",
        storyIndex: votingStoryIndex,
        lineIndex: votableLine >= 0 ? votableLine : 0,
        isStandingOvation: false,
      }), c2 as any);

      // Should not get an error
      const errors = getMessages(c2, "ERROR");
      expect(errors.length).toBe(0);

      // Vote should be tracked
      const u = getLatestStateUpdate(c1);
      expect(u.room.votingState.votesReceived.length).toBe(1);
    });

    it("broadcasts VOTING_CLOSED and clears votingState after advance", async () => {
      const { server, connections } = makeServer();
      const c1 = join(server, connections, "c1", "Alice", { isPremium: true });
      join(server, connections, "c2", "Bob");
      join(server, connections, "c3", "Carol");
      join(server, connections, "c4", "Dave");

      startCompetitive(server, c1);
      playAllRounds(server, c1, connections);

      for (let i = 0; i < 7; i++) {
        server.onMessage(JSON.stringify({ type: "REVEAL_ADVANCE" }), c1 as any);
      }
      server.onMessage(JSON.stringify({ type: "START_VOTING" }), c1 as any);
      server.onMessage(JSON.stringify({ type: "ADVANCE_VOTING" }), c1 as any);

      await vi.waitFor(() => {
        const closed = getMessages(c1, "VOTING_CLOSED");
        expect(closed.length).toBeGreaterThan(0);
      });

      const u = getLatestStateUpdate(c1);
      expect(u.room.votingState).toBeUndefined();
    });
  });

  describe("Game scores", () => {
    it("broadcasts GAME_SCORES when all stories are revealed and voted", async () => {
      const { server, connections } = makeServer();
      const c1 = join(server, connections, "c1", "Alice", { isPremium: true });
      join(server, connections, "c2", "Bob");
      join(server, connections, "c3", "Carol");
      join(server, connections, "c4", "Dave");

      startCompetitive(server, c1, 1);
      playAllRounds(server, c1, connections);

      const u = getLatestStateUpdate(c1);
      const storyCount = u.room.stories.length;

      revealAllStories(server, c1, storyCount);

      // Wait for async archiveRoom
      await vi.waitFor(() => {
        const scores = getMessages(c1, "GAME_SCORES");
        expect(scores.length).toBeGreaterThan(0);
      });

      const scores = getMessages(c1, "GAME_SCORES")[0] as any;
      expect(scores.scores).toBeDefined();
      expect(scores.scores.points).toBeDefined();
      expect(scores.gameNumber).toBe(1);
      expect(scores.seriesStandings).toBeDefined();
    });
  });

  describe("Ready flow between games", () => {
    it("lets players queue for next game in competitive END state", async () => {
      const { server, connections } = makeServer();
      const c1 = join(server, connections, "c1", "Alice", { isPremium: true });
      const c2 = join(server, connections, "c2", "Bob");
      join(server, connections, "c3", "Carol");
      join(server, connections, "c4", "Dave");

      startCompetitive(server, c1, 3);
      playAllRounds(server, c1, connections);

      const u = getLatestStateUpdate(c1);
      revealAllStories(server, c1, u.room.stories.length);

      // Wait for scores
      await vi.waitFor(() => {
        expect(getMessages(c1, "GAME_SCORES").length).toBeGreaterThan(0);
      });

      // Queue up
      server.onMessage(JSON.stringify({ type: "QUEUE_NEXT_GAME" }), c2 as any);

      const after = getLatestStateUpdate(c1);
      const bob = after.room.players.find((p: any) => p.name === "Bob");
      expect(bob.queuedForNextGame).toBe(true);
    });

    it("auto-advances to lobby when all connected players are ready (mid-series)", async () => {
      const { server, connections } = makeServer();
      const c1 = join(server, connections, "c1", "Alice", { isPremium: true });
      const c2 = join(server, connections, "c2", "Bob");
      const c3 = join(server, connections, "c3", "Carol");
      const c4 = join(server, connections, "c4", "Dave");

      startCompetitive(server, c1, 3);
      playAllRounds(server, c1, connections);

      const u = getLatestStateUpdate(c1);
      revealAllStories(server, c1, u.room.stories.length);

      await vi.waitFor(() => {
        expect(getMessages(c1, "GAME_SCORES").length).toBeGreaterThan(0);
      });

      // All 4 players queue
      for (const conn of [c1, c2, c3, c4]) {
        server.onMessage(JSON.stringify({ type: "QUEUE_NEXT_GAME" }), conn as any);
      }

      const after = getLatestStateUpdate(c1);
      expect(after.room.state).toBe("LOBBY");
      expect(after.room.series.currentGameNumber).toBe(1); // still 1 until START_GAME
    });
  });

  describe("Series state preservation", () => {
    it("preserves isPremium across game resets", async () => {
      const { server, connections } = makeServer();
      const c1 = join(server, connections, "c1", "Alice", { isPremium: true });
      const c2 = join(server, connections, "c2", "Bob");
      const c3 = join(server, connections, "c3", "Carol");
      const c4 = join(server, connections, "c4", "Dave");

      startCompetitive(server, c1, 3);
      playAllRounds(server, c1, connections);

      const u = getLatestStateUpdate(c1);
      revealAllStories(server, c1, u.room.stories.length);

      await vi.waitFor(() => {
        expect(getMessages(c1, "GAME_SCORES").length).toBeGreaterThan(0);
      });

      // All ready → auto-advance to lobby
      for (const conn of [c1, c2, c3, c4]) {
        server.onMessage(JSON.stringify({ type: "QUEUE_NEXT_GAME" }), conn as any);
      }

      const lobby = getLatestStateUpdate(c1);
      expect(lobby.room.state).toBe("LOBBY");
      expect(lobby.room.isPremium).toBe(true);
    });

    it("increments game number on second game start", async () => {
      const { server, connections } = makeServer();
      const c1 = join(server, connections, "c1", "Alice", { isPremium: true });
      const c2 = join(server, connections, "c2", "Bob");
      const c3 = join(server, connections, "c3", "Carol");
      const c4 = join(server, connections, "c4", "Dave");

      startCompetitive(server, c1, 3);
      playAllRounds(server, c1, connections);

      const u = getLatestStateUpdate(c1);
      revealAllStories(server, c1, u.room.stories.length);

      await vi.waitFor(() => {
        expect(getMessages(c1, "GAME_SCORES").length).toBeGreaterThan(0);
      });

      for (const conn of [c1, c2, c3, c4]) {
        server.onMessage(JSON.stringify({ type: "QUEUE_NEXT_GAME" }), conn as any);
      }

      // Start game 2
      startCompetitive(server, c1);

      const game2 = getLatestStateUpdate(c1);
      expect(game2.room.state).toBe("PLAYING");
      expect(game2.room.series.currentGameNumber).toBe(2);
    });
  });

  describe("Final game awards", () => {
    it("broadcasts SERIES_AWARDS when all ready after final game", async () => {
      const { server, connections } = makeServer();
      const c1 = join(server, connections, "c1", "Alice", { isPremium: true });
      const c2 = join(server, connections, "c2", "Bob");
      const c3 = join(server, connections, "c3", "Carol");
      const c4 = join(server, connections, "c4", "Dave");

      // 1-game series
      startCompetitive(server, c1, 1);
      playAllRounds(server, c1, connections);

      const u = getLatestStateUpdate(c1);
      revealAllStories(server, c1, u.room.stories.length);

      await vi.waitFor(() => {
        expect(getMessages(c1, "GAME_SCORES").length).toBeGreaterThan(0);
      });

      // All ready → should trigger SERIES_AWARDS
      for (const conn of [c1, c2, c3, c4]) {
        server.onMessage(JSON.stringify({ type: "QUEUE_NEXT_GAME" }), conn as any);
      }

      const awards = getMessages(c1, "SERIES_AWARDS");
      expect(awards.length).toBe(1);

      const msg = awards[0] as any;
      expect(msg.awards).toBeDefined();
      expect(Array.isArray(msg.awards)).toBe(true);
      expect(msg.finalStandings).toBeDefined();
    });

    it("does NOT broadcast SERIES_AWARDS on non-final game", async () => {
      const { server, connections } = makeServer();
      const c1 = join(server, connections, "c1", "Alice", { isPremium: true });
      const c2 = join(server, connections, "c2", "Bob");
      const c3 = join(server, connections, "c3", "Carol");
      const c4 = join(server, connections, "c4", "Dave");

      startCompetitive(server, c1, 3);
      playAllRounds(server, c1, connections);

      const u = getLatestStateUpdate(c1);
      revealAllStories(server, c1, u.room.stories.length);

      await vi.waitFor(() => {
        expect(getMessages(c1, "GAME_SCORES").length).toBeGreaterThan(0);
      });

      for (const conn of [c1, c2, c3, c4]) {
        server.onMessage(JSON.stringify({ type: "QUEUE_NEXT_GAME" }), conn as any);
      }

      const awards = getMessages(c1, "SERIES_AWARDS");
      expect(awards.length).toBe(0);
    });
  });

  describe("Player limits", () => {
    it("allows up to 10 players regardless of isPremium, rejects the 11th", () => {
      const { server, connections } = makeServer();
      join(server, connections, "c1", "P1"); // free host
      for (let i = 2; i <= 10; i++) {
        join(server, connections, `c${i}`, `P${i}`);
      }

      const u = getLatestStateUpdate(connections.get("c10")!);
      expect(u.room.players.length).toBe(10);

      const c11 = join(server, connections, "c11", "P11");
      const err = c11.sentMessages.find((m) => m.type === "ERROR");
      expect(err).toBeDefined();
      expect((err as any).reason).toBe("ROOM_FULL");
    });

    it("applies the same 10-player cap when host is Premium", () => {
      const { server, connections } = makeServer();
      join(server, connections, "c1", "P1", { isPremium: true });
      for (let i = 2; i <= 10; i++) {
        join(server, connections, `c${i}`, `P${i}`);
      }

      const c11 = join(server, connections, "c11", "P11");
      const err = c11.sentMessages.find((m) => m.type === "ERROR");
      expect(err).toBeDefined();
      expect((err as any).reason).toBe("ROOM_FULL");
    });
  });

  describe("Spectators in competitive mode", () => {
    it("adds mid-game joiners to pendingPlayers", () => {
      const { server, connections } = makeServer();
      const c1 = join(server, connections, "c1", "Alice", { isPremium: true });
      join(server, connections, "c2", "Bob");
      join(server, connections, "c3", "Carol");
      join(server, connections, "c4", "Dave");

      startCompetitive(server, c1);

      const spectator = join(server, connections, "c5", "Eve");
      const u = getLatestStateUpdate(spectator);
      expect(u.room.pendingPlayers.length).toBe(1);
      expect(u.room.pendingPlayers[0].name).toBe("Eve");
    });

    it("promotes ready spectators when game resets between series games", async () => {
      const { server, connections } = makeServer();
      const c1 = join(server, connections, "c1", "Alice", { isPremium: true });
      const c2 = join(server, connections, "c2", "Bob");
      const c3 = join(server, connections, "c3", "Carol");
      const c4 = join(server, connections, "c4", "Dave");

      startCompetitive(server, c1, 3);

      // Eve joins mid-game and marks ready
      const eve = join(server, connections, "c5", "Eve");
      server.onMessage(JSON.stringify({ type: "SET_READY", ready: true }), eve as any);

      playAllRounds(server, c1, connections);
      const u = getLatestStateUpdate(c1);
      revealAllStories(server, c1, u.room.stories.length);

      await vi.waitFor(() => {
        expect(getMessages(c1, "GAME_SCORES").length).toBeGreaterThan(0);
      });

      // All original players + Eve ready up
      for (const conn of [c1, c2, c3, c4, eve]) {
        server.onMessage(JSON.stringify({ type: "QUEUE_NEXT_GAME" }), conn as any);
      }

      const lobby = getLatestStateUpdate(c1);
      expect(lobby.room.state).toBe("LOBBY");
      // Eve should now be an active player
      const evePlayer = lobby.room.players.find((p: any) => p.name === "Eve");
      expect(evePlayer).toBeDefined();
      expect(lobby.room.pendingPlayers.length).toBe(0);
    });
  });
});
