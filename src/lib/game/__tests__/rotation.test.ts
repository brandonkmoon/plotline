import { describe, it, expect } from "vitest";
import { generateAssignments } from "../rotation";

function makePlayerIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `player-${i}`);
}

function validateAssignments(playerIds: string[], assignments: string[][]) {
  const n = playerIds.length;

  // Should have N stories
  expect(assignments).toHaveLength(n);

  // Each story should have exactly 7 assignments
  for (const row of assignments) {
    expect(row).toHaveLength(7);
  }

  // All assigned player IDs should be valid
  const playerSet = new Set(playerIds);
  for (const row of assignments) {
    for (const pid of row) {
      expect(playerSet.has(pid)).toBe(true);
    }
  }

  // No player has adjacent slots in any story
  for (let story = 0; story < n; story++) {
    for (let prompt = 1; prompt < 7; prompt++) {
      expect(assignments[story][prompt]).not.toBe(
        assignments[story][prompt - 1]
      );
    }
  }

  // For N > 7: no player writes multiple prompts for the same story
  if (n > 7) {
    for (let story = 0; story < n; story++) {
      const row = assignments[story];
      const unique = new Set(row);
      expect(unique.size).toBe(7);
    }
  }

  // Load balance: count total prompts per player
  const load: Map<string, number> = new Map();
  for (const id of playerIds) load.set(id, 0);
  for (const row of assignments) {
    for (const pid of row) {
      load.set(pid, (load.get(pid) ?? 0) + 1);
    }
  }
  const counts = Array.from(load.values());
  const maxLoad = Math.max(...counts);
  const minLoad = Math.min(...counts);
  const variance = maxLoad - minLoad;

  if (n === 7) {
    // Perfect rotation: each player writes exactly 7
    expect(variance).toBeLessThanOrEqual(1);
    for (const c of counts) {
      expect(c).toBe(7);
    }
  } else {
    expect(variance).toBeLessThanOrEqual(2);
  }
}

describe("generateAssignments", () => {
  it("throws for fewer than 4 players", () => {
    expect(() => generateAssignments(makePlayerIds(3))).toThrow();
  });

  it("throws for more than 10 players", () => {
    expect(() => generateAssignments(makePlayerIds(11))).toThrow();
  });

  for (const n of [4, 5, 6, 7, 8, 9, 10]) {
    it(`produces valid assignments for N=${n}`, () => {
      const playerIds = makePlayerIds(n);
      const assignments = generateAssignments(playerIds);
      validateAssignments(playerIds, assignments);
    });
  }

  it("produces deterministic-shaped output for N=7 (perfect case)", () => {
    const playerIds = makePlayerIds(7);
    const assignments = generateAssignments(playerIds);

    // Each player should appear exactly once per story
    for (const row of assignments) {
      const unique = new Set(row);
      expect(unique.size).toBe(7);
    }
  });

  // Core round-robin invariant: for each promptIndex (act) column, every
  // player is assigned exactly one slot across all stories. This guarantees
  // each act is written once by each player — the bijection that makes the
  // rotation fair.
  for (const n of [4, 5, 6, 7, 8, 9, 10]) {
    it(`each player writes exactly one slot per promptIndex for N=${n}`, () => {
      const playerIds = makePlayerIds(n);
      const assignments = generateAssignments(playerIds);

      for (let prompt = 0; prompt < 7; prompt++) {
        const countByPlayer = new Map<string, number>();
        for (const id of playerIds) countByPlayer.set(id, 0);
        for (let story = 0; story < n; story++) {
          const pid = assignments[story][prompt];
          countByPlayer.set(pid, (countByPlayer.get(pid) ?? 0) + 1);
        }
        for (const id of playerIds) {
          expect(countByPlayer.get(id)).toBe(1);
        }
      }
    });
  }

  it("handles N=4 where players must write multiple prompts per story", () => {
    const playerIds = makePlayerIds(4);
    const assignments = generateAssignments(playerIds);

    // Each story has 7 slots but only 4 players, so some repeat
    for (const row of assignments) {
      expect(row).toHaveLength(7);
      // But no adjacent duplicates
      for (let i = 1; i < 7; i++) {
        expect(row[i]).not.toBe(row[i - 1]);
      }
    }
  });
});
