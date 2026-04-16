import { describe, it, expect } from "vitest";
import { serializeRoomForArchive } from "../serialize";
import type { Room } from "@/lib/game/types";
import { PROMPTS } from "@/lib/game/prompts";

function makeRoom(overrides?: Partial<Room>): Room {
  const players = [
    { id: "p1", name: "Alice", isHost: true, isConnected: true, joinedAt: 1000 },
    { id: "p2", name: "Bob", isHost: false, isConnected: true, joinedAt: 1001 },
    { id: "p3", name: "Carol", isHost: false, isConnected: true, joinedAt: 1002 },
    { id: "p4", name: "Dave", isHost: false, isConnected: true, joinedAt: 1003 },
  ];

  const stories = [
    {
      index: 0,
      isRevealed: true,
      slots: PROMPTS.map((p, i) => ({
        storyIndex: 0,
        promptIndex: i,
        playerId: players[i % players.length].id,
        response: `Response ${i} for story 0`,
        isPlaceholder: false,
      })),
    },
    {
      index: 1,
      isRevealed: true,
      slots: PROMPTS.map((p, i) => ({
        storyIndex: 1,
        promptIndex: i,
        playerId: players[(i + 1) % players.length].id,
        response: `Response ${i} for story 1`,
        isPlaceholder: false,
      })),
    },
  ];

  return {
    code: "ABCD",
    state: "END",
    players,
    stories,
    currentRound: 7,
    hostId: "p1",
    createdAt: 1000,
    updatedAt: 5000,
    pendingPlayers: [],
    ...overrides,
  };
}

describe("serializeRoomForArchive", () => {
  it("serializes a complete room with all responses filled", () => {
    const room = makeRoom();
    const result = serializeRoomForArchive(room);

    expect(result.room.code).toBe("ABCD");
    expect(result.room.createdAt).toBe(1000);
    expect(result.room.completedAt).toBe(5000);
    expect(result.room.playerCount).toBe(4);
    expect(result.room.storyCount).toBe(2);
    expect(result.stories).toHaveLength(2);
  });

  it("correctly indexes stories", () => {
    const room = makeRoom();
    const result = serializeRoomForArchive(room);

    expect(result.stories[0].storyIndex).toBe(0);
    expect(result.stories[1].storyIndex).toBe(1);
  });

  it("assigns correct prompt texts from PROMPTS constant", () => {
    const room = makeRoom();
    const result = serializeRoomForArchive(room);

    for (const story of result.stories) {
      for (let i = 0; i < story.prompts.length; i++) {
        expect(story.prompts[i].promptText).toBe(PROMPTS[i].text);
      }
    }
  });

  it("resolves player names correctly", () => {
    const room = makeRoom();
    const result = serializeRoomForArchive(room);

    // Story 0: prompt 0 -> p1 (Alice), prompt 1 -> p2 (Bob), etc.
    expect(result.stories[0].prompts[0].authorName).toBe("Alice");
    expect(result.stories[0].prompts[1].authorName).toBe("Bob");
    expect(result.stories[0].prompts[2].authorName).toBe("Carol");
    expect(result.stories[0].prompts[3].authorName).toBe("Dave");
  });

  it("uses 1-indexed slots", () => {
    const room = makeRoom();
    const result = serializeRoomForArchive(room);

    for (const story of result.stories) {
      story.prompts.forEach((p, i) => {
        expect(p.slot).toBe(i + 1);
      });
    }
  });

  it("marks placeholder responses correctly", () => {
    const room = makeRoom();
    // Make slot 2 of story 0 a placeholder
    room.stories[0].slots[2] = {
      storyIndex: 0,
      promptIndex: 2,
      playerId: "p3",
      response: null,
      isPlaceholder: true,
    };

    const result = serializeRoomForArchive(room);

    expect(result.stories[0].prompts[2].wasPlaceholder).toBe(true);
    // Should still have a contribution (random placeholder)
    expect(result.stories[0].prompts[2].contribution).toBeTruthy();
  });

  it("marks null responses as placeholders even if isPlaceholder is false", () => {
    const room = makeRoom();
    room.stories[0].slots[3] = {
      storyIndex: 0,
      promptIndex: 3,
      playerId: "p4",
      response: null,
      isPlaceholder: false,
    };

    const result = serializeRoomForArchive(room);

    expect(result.stories[0].prompts[3].wasPlaceholder).toBe(true);
    expect(result.stories[0].prompts[3].contribution).toBeTruthy();
  });

  it("sets readerName from the player who wrote prompt 6", () => {
    const room = makeRoom();
    // Story 0, prompt 6 (index 6) -> player p3 (6 % 4 = 2 -> players[2] = Carol)
    const result = serializeRoomForArchive(room);

    // Prompt index 6, player index = 6 % 4 = 2 -> Carol
    expect(result.stories[0].readerName).toBe("Carol");
    // Story 1, prompt 6 -> player index = (6+1) % 4 = 3 -> Dave
    expect(result.stories[1].readerName).toBe("Dave");
  });

  it("handles missing playerId gracefully", () => {
    const room = makeRoom();
    room.stories[0].slots[0] = {
      storyIndex: 0,
      promptIndex: 0,
      playerId: null,
      response: "Anonymous contribution",
      isPlaceholder: false,
    };

    const result = serializeRoomForArchive(room);

    expect(result.stories[0].prompts[0].authorName).toBe("Unknown");
    expect(result.stories[0].prompts[0].contribution).toBe(
      "Anonymous contribution"
    );
  });
});
