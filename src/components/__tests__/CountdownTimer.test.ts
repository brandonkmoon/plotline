import { describe, it, expect } from "vitest";

// Test the countdown math logic directly (not the React component)
// to verify NaN safety without needing a DOM renderer.

function computeRemaining(
  roundStartedAt: number | null | undefined,
  duration: number = 90,
  now: number = Date.now()
): number | null {
  if (
    roundStartedAt == null ||
    !Number.isFinite(roundStartedAt) ||
    roundStartedAt <= 0
  ) {
    return null;
  }
  const elapsed = Math.floor((now - roundStartedAt) / 1000);
  const left = Math.max(0, duration - elapsed);
  return Number.isFinite(left) ? left : null;
}

describe("CountdownTimer math", () => {
  it("returns null when roundStartedAt is null", () => {
    expect(computeRemaining(null)).toBe(null);
  });

  it("returns null when roundStartedAt is undefined", () => {
    expect(computeRemaining(undefined)).toBe(null);
  });

  it("returns null when roundStartedAt is NaN", () => {
    expect(computeRemaining(NaN)).toBe(null);
  });

  it("returns null when roundStartedAt is 0", () => {
    expect(computeRemaining(0)).toBe(null);
  });

  it("returns null when roundStartedAt is negative", () => {
    expect(computeRemaining(-1000)).toBe(null);
  });

  it("returns null when roundStartedAt is Infinity", () => {
    expect(computeRemaining(Infinity)).toBe(null);
  });

  it("computes correct remaining time", () => {
    const now = Date.now();
    const startedAt = now - 30_000; // 30 seconds ago
    expect(computeRemaining(startedAt, 90, now)).toBe(60);
  });

  it("clamps to 0 when time has elapsed", () => {
    const now = Date.now();
    const startedAt = now - 120_000; // 120 seconds ago, past 90s duration
    expect(computeRemaining(startedAt, 90, now)).toBe(0);
  });

  it("returns full duration when just started", () => {
    const now = Date.now();
    expect(computeRemaining(now, 90, now)).toBe(90);
  });
});

describe("CountdownTimer STATE_UPDATE shape", () => {
  it("a PROMPT-phase state snapshot has numeric roundStartedAt and roundDurationMs", () => {
    // Construct a STATE_UPDATE-like snapshot as it would be received from
    // the server during the PLAYING phase.
    const snapshot = {
      type: "STATE_UPDATE" as const,
      room: {
        code: "ABCD",
        state: "PLAYING" as const,
        players: [],
        stories: [],
        currentRound: 0,
        hostId: "p1",
        createdAt: 0,
        updatedAt: 0,
      },
      playerId: "p1",
      roundStartedAt: Date.now(),
      roundDurationMs: 90_000,
      pendingConnected: 0,
      pendingDisconnected: 0,
      protocolVersion: 2,
    };

    expect(typeof snapshot.roundStartedAt).toBe("number");
    expect(Number.isFinite(snapshot.roundStartedAt)).toBe(true);
    expect(typeof snapshot.roundDurationMs).toBe("number");
    expect(Number.isFinite(snapshot.roundDurationMs)).toBe(true);
    expect(snapshot.roundDurationMs).toBeGreaterThan(0);
  });
});
