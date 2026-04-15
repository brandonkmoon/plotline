import { describe, it, expect } from "vitest";
import { assembleStories } from "../storyAssembly";
import { PROMPTS, PLACEHOLDERS } from "../prompts";
import type { Room, Story, PromptSlot } from "../types";

function makeRoom(stories: Story[]): Room {
  return {
    code: "TEST",
    state: "REVEAL",
    players: [],
    stories,
    currentRound: 7,
    hostId: "host",
    createdAt: 1000,
    updatedAt: 2000,
  };
}

function makeSlot(
  storyIndex: number,
  promptIndex: number,
  response: string | null,
  isPlaceholder = false
): PromptSlot {
  return {
    storyIndex,
    promptIndex,
    playerId: "player-1",
    response,
    isPlaceholder,
  };
}

describe("assembleStories", () => {
  it("assembles a fully complete story", () => {
    const responses = [
      "Bob the brave",
      "Alice the clever",
      "at the supermarket",
      "buying 47 watermelons",
      '"Why are we here?"',
      '"Because you drove us here."',
      "They left with zero watermelons.",
    ];

    const story: Story = {
      index: 0,
      slots: responses.map((r, i) => makeSlot(0, i, r)),
      isRevealed: true,
    };

    const room = makeRoom([story]);
    const assembled = assembleStories(room);

    expect(assembled).toHaveLength(1);
    expect(assembled[0].responses).toEqual(responses);
    expect(assembled[0].prompts).toHaveLength(7);
    expect(assembled[0].storyIndex).toBe(0);
  });

  it("substitutes placeholders for missing responses", () => {
    const story: Story = {
      index: 0,
      slots: [
        makeSlot(0, 0, "Bob"),
        makeSlot(0, 1, null), // missing
        makeSlot(0, 2, "at the park"),
        makeSlot(0, 3, null), // missing
        makeSlot(0, 4, '"Hello!"'),
        makeSlot(0, 5, null), // missing
        makeSlot(0, 6, "The end."),
      ],
      isRevealed: true,
    };

    const room = makeRoom([story]);
    const assembled = assembleStories(room);

    expect(assembled[0].responses[0]).toBe("Bob");
    expect(assembled[0].responses[2]).toBe("at the park");
    expect(assembled[0].responses[4]).toBe('"Hello!"');
    expect(assembled[0].responses[6]).toBe("The end.");

    // Missing slots should be filled with placeholder strings
    expect(assembled[0].responses[1]).toBeTruthy();
    expect(assembled[0].responses[3]).toBeTruthy();
    expect(assembled[0].responses[5]).toBeTruthy();

    // The placeholders should be from the correct prompt bucket
    expect(PLACEHOLDERS[1]).toContain(assembled[0].responses[1]);
    expect(PLACEHOLDERS[3]).toContain(assembled[0].responses[3]);
    expect(PLACEHOLDERS[5]).toContain(assembled[0].responses[5]);
  });

  it("assembles multiple stories", () => {
    const stories: Story[] = [0, 1, 2].map((idx) => ({
      index: idx,
      slots: Array.from({ length: 7 }, (_, i) =>
        makeSlot(idx, i, `Story ${idx} Prompt ${i}`)
      ),
      isRevealed: true,
    }));

    const room = makeRoom(stories);
    const assembled = assembleStories(room);

    expect(assembled).toHaveLength(3);
    for (let s = 0; s < 3; s++) {
      expect(assembled[s].storyIndex).toBe(s);
      for (let p = 0; p < 7; p++) {
        expect(assembled[s].responses[p]).toBe(`Story ${s} Prompt ${p}`);
      }
    }
  });

  it("includes prompt text in assembled stories", () => {
    const story: Story = {
      index: 0,
      slots: Array.from({ length: 7 }, (_, i) => makeSlot(0, i, `resp-${i}`)),
      isRevealed: true,
    };

    const room = makeRoom([story]);
    const assembled = assembleStories(room);

    expect(assembled[0].prompts).toEqual(PROMPTS.map((p) => p.text));
  });
});
