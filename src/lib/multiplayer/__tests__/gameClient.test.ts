import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GameClient } from "@/lib/multiplayer/gameClient";

// Mock PartySocket
class MockPartySocket {
  readyState: number = WebSocket.OPEN;
  private listeners: Map<string, Set<(event: any) => void>> = new Map();
  public sentMessages: string[] = [];
  public closeCallCount = 0;

  constructor(public opts: { host: string; room: string }) {
    // Trigger open on next tick
    setTimeout(() => this.emit("open", {}), 0);
  }

  addEventListener(type: string, cb: (event: any) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(cb);
  }

  removeEventListener(type: string, cb: (event: any) => void) {
    this.listeners.get(type)?.delete(cb);
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.closeCallCount++;
    this.readyState = WebSocket.CLOSED;
  }

  // Test helpers
  emit(type: string, event: any) {
    for (const cb of this.listeners.get(type) ?? []) {
      cb(event);
    }
  }

  simulateMessage(data: any) {
    this.emit("message", { data: JSON.stringify(data) });
  }
}

vi.mock("partysocket", () => ({
  default: vi.fn().mockImplementation((opts: any) => new MockPartySocket(opts)),
}));

describe("GameClient", () => {
  let client: GameClient;
  let mockSocket: MockPartySocket;

  beforeEach(() => {
    client = new GameClient();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    client.disconnect();
    vi.useRealTimers();
  });

  function getSocket(): MockPartySocket {
    // Access the internal socket via connect side effect
    return (client as any).socket as MockPartySocket;
  }

  describe("connect", () => {
    it("should connect and return playerId on STATE_UPDATE", async () => {
      const connectPromise = client.connect("ABCD", "Alice");

      // Wait for the open event and JOIN_ROOM message
      await vi.advanceTimersByTimeAsync(10);

      const socket = getSocket();
      expect(socket.sentMessages.length).toBe(1);
      const joinMsg = JSON.parse(socket.sentMessages[0]);
      expect(joinMsg.type).toBe("JOIN_ROOM");
      expect(joinMsg.playerName).toBe("Alice");

      // Simulate server response
      socket.simulateMessage({
        type: "STATE_UPDATE",
        room: { code: "ABCD", state: "LOBBY", players: [], stories: [], currentRound: 0, hostId: "p1", createdAt: 0, updatedAt: 0 },
        playerId: "p1",
        roundStartedAt: null,
        roundDurationMs: 90000,
        pendingConnected: 0,
        pendingDisconnected: 0,
        protocolVersion: 2,
      });

      const id = await connectPromise;
      expect(id).toBe("p1");
      expect(client.getPlayerId()).toBe("p1");
    });

    it("should send playerId for reconnection", async () => {
      const connectPromise = client.connect("ABCD", "Alice", "existing-id");

      await vi.advanceTimersByTimeAsync(10);

      const socket = getSocket();
      const joinMsg = JSON.parse(socket.sentMessages[0]);
      expect(joinMsg.type).toBe("JOIN_ROOM");
      expect(joinMsg.playerId).toBe("existing-id");

      // Resolve the promise
      socket.simulateMessage({
        type: "STATE_UPDATE",
        room: { code: "ABCD", state: "LOBBY", players: [], stories: [], currentRound: 0, hostId: "existing-id", createdAt: 0, updatedAt: 0 },
        playerId: "existing-id",
        roundStartedAt: null,
        roundDurationMs: 90000,
        pendingConnected: 0,
        pendingDisconnected: 0,
        protocolVersion: 2,
      });

      const id = await connectPromise;
      expect(id).toBe("existing-id");
    });

    it("should reject on ERROR message", async () => {
      const connectPromise = client.connect("ABCD", "Alice");

      await vi.advanceTimersByTimeAsync(10);

      const socket = getSocket();
      socket.simulateMessage({
        type: "ERROR",
        reason: "Room is full",
      });

      await expect(connectPromise).rejects.toThrow("Room is full");
    });
  });

  describe("disconnect", () => {
    it("should close socket and reset state", async () => {
      const connectPromise = client.connect("ABCD", "Alice");
      await vi.advanceTimersByTimeAsync(10);
      const socket = getSocket();
      socket.simulateMessage({
        type: "STATE_UPDATE",
        room: { code: "ABCD", state: "LOBBY", players: [], stories: [], currentRound: 0, hostId: "p1", createdAt: 0, updatedAt: 0 },
        playerId: "p1",
        roundStartedAt: null,
        roundDurationMs: 90000,
        pendingConnected: 0,
        pendingDisconnected: 0,
        protocolVersion: 2,
      });
      await connectPromise;

      client.disconnect();
      expect(socket.closeCallCount).toBe(1);
      expect(client.getPlayerId()).toBeNull();
      expect(client.isConnected()).toBe(false);
    });
  });

  describe("actions", () => {
    async function connectClient() {
      const connectPromise = client.connect("ABCD", "Alice");
      await vi.advanceTimersByTimeAsync(10);
      const socket = getSocket();
      socket.simulateMessage({
        type: "STATE_UPDATE",
        room: { code: "ABCD", state: "LOBBY", players: [], stories: [], currentRound: 0, hostId: "p1", createdAt: 0, updatedAt: 0 },
        playerId: "p1",
        roundStartedAt: null,
        roundDurationMs: 90000,
        pendingConnected: 0,
        pendingDisconnected: 0,
        protocolVersion: 2,
      });
      await connectPromise;
      socket.sentMessages.length = 0; // clear join message
      return socket;
    }

    it("should send START_GAME", async () => {
      const socket = await connectClient();
      client.startGame();
      expect(JSON.parse(socket.sentMessages[0])).toEqual({ type: "START_GAME" });
    });

    it("should send SUBMIT_PROMPT", async () => {
      const socket = await connectClient();
      client.submitPrompt(0, 1, "test response");
      expect(JSON.parse(socket.sentMessages[0])).toEqual({
        type: "SUBMIT_PROMPT",
        storyIndex: 0,
        promptIndex: 1,
        response: "test response",
      });
    });

    it("should send HOST_ADVANCE", async () => {
      const socket = await connectClient();
      client.hostAdvance();
      expect(JSON.parse(socket.sentMessages[0])).toEqual({ type: "HOST_ADVANCE" });
    });

    it("should send ADVANCE_REVEAL", async () => {
      const socket = await connectClient();
      client.advanceReveal();
      expect(JSON.parse(socket.sentMessages[0])).toEqual({ type: "ADVANCE_REVEAL" });
    });

    it("should send END_GAME", async () => {
      const socket = await connectClient();
      client.endGame();
      expect(JSON.parse(socket.sentMessages[0])).toEqual({ type: "END_GAME" });
    });

    it("should send PLAY_AGAIN", async () => {
      const socket = await connectClient();
      client.playAgain();
      expect(JSON.parse(socket.sentMessages[0])).toEqual({ type: "PLAY_AGAIN" });
    });

    it("should send TYPING_STATUS", async () => {
      const socket = await connectClient();
      client.sendTypingStatus("writing");
      expect(JSON.parse(socket.sentMessages[0])).toEqual({
        type: "TYPING_STATUS",
        status: "writing",
      });
    });
  });

  describe("subscriptions", () => {
    async function connectClient() {
      const connectPromise = client.connect("ABCD", "Alice");
      await vi.advanceTimersByTimeAsync(10);
      const socket = getSocket();
      socket.simulateMessage({
        type: "STATE_UPDATE",
        room: { code: "ABCD", state: "LOBBY", players: [], stories: [], currentRound: 0, hostId: "p1", createdAt: 0, updatedAt: 0 },
        playerId: "p1",
        roundStartedAt: null,
        roundDurationMs: 90000,
        pendingConnected: 0,
        pendingDisconnected: 0,
        protocolVersion: 2,
      });
      await connectPromise;
      return socket;
    }

    it("should fire state update callbacks", async () => {
      const socket = await connectClient();
      const cb = vi.fn();
      client.onStateUpdate(cb);

      const room = { code: "ABCD", state: "PLAYING", players: [], stories: [], currentRound: 0, hostId: "p1", createdAt: 0, updatedAt: 0 };
      socket.simulateMessage({
        type: "STATE_UPDATE",
        room,
        playerId: "p1",
        roundStartedAt: null,
        roundDurationMs: 90000,
        pendingConnected: 0,
        pendingDisconnected: 0,
        protocolVersion: 2,
      });

      expect(cb).toHaveBeenCalledWith(room);
    });

    it("should fire player status callbacks", async () => {
      const socket = await connectClient();
      const cb = vi.fn();
      client.onPlayerStatusChanged(cb);

      const statuses = { p1: "writing" as const, p2: "idle" as const };
      socket.simulateMessage({ type: "PLAYER_STATUS_CHANGED", statuses });

      expect(cb).toHaveBeenCalledWith(statuses);
    });

    it("should fire error callbacks", async () => {
      const socket = await connectClient();
      const cb = vi.fn();
      client.onError(cb);

      socket.simulateMessage({ type: "ERROR", reason: "something broke" });

      expect(cb).toHaveBeenCalledWith("something broke");
    });

    it("should fire advance available callbacks", async () => {
      const socket = await connectClient();
      const cb = vi.fn();
      client.onAdvanceAvailable(cb);

      socket.simulateMessage({ type: "ADVANCE_AVAILABLE", unsubmittedCount: 3 });

      expect(cb).toHaveBeenCalledWith(3);
    });

    it("should fire assembled stories callbacks", async () => {
      const socket = await connectClient();
      const cb = vi.fn();
      client.onAssembledStories(cb);

      const stories = [{ storyIndex: 0, responses: ["a"], prompts: ["q"] }];
      socket.simulateMessage({ type: "ASSEMBLED_STORIES", stories });

      expect(cb).toHaveBeenCalledWith(stories);
    });

    it("should unsubscribe when returned function is called", async () => {
      const socket = await connectClient();
      const cb = vi.fn();
      const unsub = client.onStateUpdate(cb);

      // cb may have been called once with cached state from connect (replay behavior)
      const callCountAfterSubscribe = cb.mock.calls.length;

      unsub();

      const room = { code: "ABCD", state: "PLAYING", players: [], stories: [], currentRound: 0, hostId: "p1", createdAt: 0, updatedAt: 0 };
      socket.simulateMessage({
        type: "STATE_UPDATE",
        room,
        playerId: "p1",
        roundStartedAt: null,
        roundDurationMs: 90000,
        pendingConnected: 0,
        pendingDisconnected: 0,
        protocolVersion: 2,
      });

      // After unsub, no new calls should have been made
      expect(cb.mock.calls.length).toBe(callCountAfterSubscribe);
    });
  });
});
