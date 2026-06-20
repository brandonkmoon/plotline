/**
 * Rotation assignment engine.
 *
 * Given N players (4-10), produces an N x 7 assignment matrix where:
 *   assignments[storyIndex][promptIndex] = playerId
 *
 * Constraints:
 *   1. No player writes two adjacent prompts within the same story.
 *   2. Writing load is balanced (each player writes ~7 prompts total).
 *   3. For N >= 7, no player writes more than one prompt per story.
 *   4. For N < 7, a player may write multiple prompts in a story but
 *      those prompts must never be adjacent.
 */

const PROMPTS_PER_STORY = 7;

export function generateAssignments(playerIds: string[]): string[][] {
  const n = playerIds.length;
  if (n < 4 || n > 10) {
    throw new Error(`Player count must be 4-10, got ${n}`);
  }

  if (n >= 7) {
    return generateForLargeN(playerIds);
  } else {
    return generateForSmallN(playerIds);
  }
}

/**
 * N >= 7: We have enough players that each story can use 7 distinct players.
 * Use a Latin-square-like rotation so no player appears twice in any story
 * and adjacency within a story is guaranteed distinct.
 */
function generateForLargeN(playerIds: string[]): string[][] {
  const n = playerIds.length;
  const assignments: string[][] = [];

  // For each story i, pick 7 distinct players using staggered offsets.
  // offset[j] ensures slot j and slot j+1 map to different players.
  // We use offsets that are coprime-spaced to avoid collisions.
  for (let story = 0; story < n; story++) {
    const row: string[] = [];
    for (let prompt = 0; prompt < PROMPTS_PER_STORY; prompt++) {
      // Shift by (story + prompt * step) mod n where step > 1
      // Using a different multiplier per prompt guarantees no two
      // adjacent prompts land on the same player.
      const idx = (story + prompt * stepForN(n)) % n;
      row.push(playerIds[idx]);
    }
    assignments.push(row);
  }

  return assignments;
}

/**
 * Pick a step size for N that:
 *   - is coprime with N (so all N values are reachable)
 *   - is >= 2 (so consecutive prompts differ)
 *   - step != N - 1 when possible (so step and 1 don't collide)
 */
function stepForN(n: number): number {
  // Try 2 first; if gcd(2, n) != 1, try 3, etc.
  for (let s = 2; s < n; s++) {
    if (gcd(s, n) === 1) {
      return s;
    }
  }
  return 2; // fallback, should not happen for n >= 7
}

function gcd(a: number, b: number): number {
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

/**
 * N < 7 (4, 5, or 6 players): Players must write multiple prompts per story.
 * We use a greedy approach per story that ensures:
 *   - No adjacent slots have the same player
 *   - Load is balanced globally
 */
function generateForSmallN(playerIds: string[]): string[][] {
  const n = playerIds.length;
  const totalSlots = n * PROMPTS_PER_STORY;
  const idealPerPlayer = Math.floor(totalSlots / n); // always 7
  const assignments: string[][] = [];

  // Track how many prompts each player has been assigned globally.
  const load: Map<string, number> = new Map();
  for (const id of playerIds) {
    load.set(id, 0);
  }

  for (let story = 0; story < n; story++) {
    const row: string[] = [];

    for (let prompt = 0; prompt < PROMPTS_PER_STORY; prompt++) {
      const prev = prompt > 0 ? row[prompt - 1] : null;
      // Track who is already in this story and their positions
      const storyPositions: Map<string, number[]> = new Map();
      for (let p = 0; p < prompt; p++) {
        const pid = row[p];
        if (!storyPositions.has(pid)) {
          storyPositions.set(pid, []);
        }
        storyPositions.get(pid)!.push(p);
      }

      // Find eligible players: not the previous slot's player
      const eligible = playerIds.filter((id) => id !== prev);

      // Sort eligible by load (ascending), breaking ties by
      // fewest appearances in this story
      eligible.sort((a, b) => {
        const loadDiff = (load.get(a) ?? 0) - (load.get(b) ?? 0);
        if (loadDiff !== 0) return loadDiff;
        const storyCountA = (storyPositions.get(a) ?? []).length;
        const storyCountB = (storyPositions.get(b) ?? []).length;
        return storyCountA - storyCountB;
      });

      const chosen = eligible[0];
      row.push(chosen);
      load.set(chosen, (load.get(chosen) ?? 0) + 1);
    }

    assignments.push(row);
  }

  return assignments;
}
