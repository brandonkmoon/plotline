import { describe, it, expect } from "vitest";
import { computeSeriesAwards } from "../handlers/voting";
import type { Player, SeriesState, StoryVoteResult, Vote } from "@/lib/game/types";

// Minimal mock of the server
function makeServer(players: Player[], seriesState: SeriesState) {
  return {
    gameState: { players },
    seriesState,
  } as any;
}

function makeVote(voterId: string, storyIndex: number, lineIndex: number, isStandingOvation = false): Vote {
  return { voterId, storyIndex, lineIndex, isStandingOvation };
}

function makeVoteResult(
  storyIndex: number,
  votes: Vote[],
  lineAuthors: Record<number, string>,
  lineTexts: Record<number, string>
): StoryVoteResult {
  // Find winning line
  const tallies: Record<number, number> = {};
  for (const v of votes) {
    tallies[v.lineIndex] = (tallies[v.lineIndex] ?? 0) + (v.isStandingOvation ? 3 : 1);
  }
  let winningLineIndex = 0;
  let maxTally = 0;
  for (const [idx, tally] of Object.entries(tallies)) {
    if (tally > maxTally) { maxTally = tally; winningLineIndex = Number(idx); }
  }

  return {
    storyIndex,
    votes,
    winningLineIndex,
    winningAuthorId: lineAuthors[winningLineIndex] ?? "",
    winningLineText: lineTexts[winningLineIndex] ?? "",
    lineAuthors,
    lineTexts,
  };
}

const players: Player[] = [
  { id: "p1", name: "Alice", isHost: true, isConnected: true, joinedAt: 0 },
  { id: "p2", name: "Bob", isHost: false, isConnected: true, joinedAt: 0 },
  { id: "p3", name: "Carol", isHost: false, isConnected: true, joinedAt: 0 },
  { id: "p4", name: "Dave", isHost: false, isConnected: true, joinedAt: 0 },
];

describe("computeSeriesAwards", () => {
  it("returns awards for each category", () => {
    const lineAuthors: Record<number, string> = {
      0: "p1", 1: "p2", 2: "p3", 3: "p4", 4: "p1", 5: "p2", 6: "p3",
    };
    const lineTexts: Record<number, string> = {
      0: "Alice — a detective", 1: "Bob — a chef", 2: "at the park",
      3: "running away", 4: "Hello!", 5: "Goodbye!", 6: "The end.",
    };

    const votes = [
      makeVote("p2", 0, 0), // vote for line 0 (character intro → p1)
      makeVote("p3", 0, 2), // vote for line 2 (setting → p3)
      makeVote("p4", 0, 4), // vote for line 4 (dialogue → p1)
      makeVote("p1", 0, 6), // vote for line 6 (ending → p3)
    ];

    const voteResult = makeVoteResult(0, votes, lineAuthors, lineTexts);

    const series: SeriesState = {
      mode: "competitive",
      totalGames: 1,
      currentGameNumber: 1,
      cumulativePoints: { p1: 2, p2: 0, p3: 2, p4: 0 },
      standingOvationsUsed: {},
      completedGames: [{
        gameNumber: 1,
        scores: { points: { p1: 2, p2: 0, p3: 2, p4: 0 }, lineOfTheGame: null },
        voteResults: [voteResult],
      }],
      awards: [],
    };

    const server = makeServer(players, series);
    const awards = computeSeriesAwards(server);

    // Should have awards
    expect(awards.length).toBeGreaterThan(0);

    // Each award has required fields
    for (const award of awards) {
      expect(award.id).toBeTruthy();
      expect(award.title).toBeTruthy();
      expect(award.playerId).toBeTruthy();
      expect(award.playerName).toBeTruthy();
    }

    // No MVP award (we removed it)
    expect(awards.find((a) => a.id === "mvp")).toBeUndefined();

    // Casting Director should go to p1 (got vote on line 0, a character intro)
    const casting = awards.find((a) => a.id === "casting-director");
    expect(casting?.playerId).toBe("p1");

    // Closer should go to p3 (got vote on line 6, an ending)
    const closer = awards.find((a) => a.id === "closer");
    expect(closer?.playerId).toBe("p3");
  });

  it("computes Line of the Series from highest-scoring line across games", () => {
    const game1Authors: Record<number, string> = {
      0: "p1", 1: "p2", 2: "p3", 3: "p4", 4: "p1", 5: "p2", 6: "p3",
    };
    const game1Texts: Record<number, string> = {
      0: "Alice — spy", 1: "Bob — chef", 2: "at park", 3: "running",
      4: "Best line ever", 5: "Meh", 6: "The end",
    };
    const game2Authors: Record<number, string> = { ...game1Authors };
    const game2Texts: Record<number, string> = {
      ...game1Texts, 4: "Even better line",
    };

    // Game 1: line 4 gets 2 votes
    const g1Votes = [makeVote("p2", 0, 4), makeVote("p3", 0, 4)];
    // Game 2: line 4 gets 3 votes (higher score)
    const g2Votes = [makeVote("p2", 0, 4), makeVote("p3", 0, 4), makeVote("p4", 0, 4)];

    const series: SeriesState = {
      mode: "competitive",
      totalGames: 2,
      currentGameNumber: 2,
      cumulativePoints: {},
      standingOvationsUsed: {},
      completedGames: [
        { gameNumber: 1, scores: { points: {}, lineOfTheGame: null }, voteResults: [makeVoteResult(0, g1Votes, game1Authors, game1Texts)] },
        { gameNumber: 2, scores: { points: {}, lineOfTheGame: null }, voteResults: [makeVoteResult(0, g2Votes, game2Authors, game2Texts)] },
      ],
      awards: [],
    };

    const server = makeServer(players, series);
    const awards = computeSeriesAwards(server);
    const lineAward = awards.find((a) => a.id === "line-of-the-series");

    expect(lineAward).toBeDefined();
    expect(lineAward?.detail).toBe("Even better line");
    expect(lineAward?.playerId).toBe("p1");
  });

  it("computes Fan Favorite from standing ovation count", () => {
    const authors: Record<number, string> = {
      0: "p1", 1: "p2", 2: "p3", 3: "p4", 4: "p1", 5: "p2", 6: "p3",
    };
    const texts: Record<number, string> = {
      0: "A", 1: "B", 2: "C", 3: "D", 4: "E", 5: "F", 6: "G",
    };

    // p2 gets 2 standing ovations, p1 gets 1
    const votes = [
      makeVote("p3", 0, 1, true),  // standing ovation for p2's line
      makeVote("p4", 0, 5, true),  // standing ovation for p2's line
      makeVote("p2", 0, 0, true),  // standing ovation for p1's line
    ];

    const series: SeriesState = {
      mode: "competitive",
      totalGames: 1,
      currentGameNumber: 1,
      cumulativePoints: {},
      standingOvationsUsed: {},
      completedGames: [{
        gameNumber: 1,
        scores: { points: {}, lineOfTheGame: null },
        voteResults: [makeVoteResult(0, votes, authors, texts)],
      }],
      awards: [],
    };

    const server = makeServer(players, series);
    const awards = computeSeriesAwards(server);
    const fanFav = awards.find((a) => a.id === "fan-favorite");

    expect(fanFav?.playerId).toBe("p2");
    expect(fanFav?.detail).toContain("2 standing ovations");
  });

  it("includes detail stats on each award", () => {
    const authors: Record<number, string> = {
      0: "p1", 1: "p2", 2: "p3", 3: "p4", 4: "p1", 5: "p2", 6: "p3",
    };
    const texts: Record<number, string> = {
      0: "Alice — spy", 1: "Bob — chef", 2: "park", 3: "run", 4: "hi", 5: "bye", 6: "end",
    };
    const votes = [
      makeVote("p2", 0, 0), makeVote("p3", 0, 2),
      makeVote("p4", 0, 4), makeVote("p1", 0, 6),
    ];

    const series: SeriesState = {
      mode: "competitive",
      totalGames: 1,
      currentGameNumber: 1,
      cumulativePoints: {},
      standingOvationsUsed: {},
      completedGames: [{
        gameNumber: 1,
        scores: { points: {}, lineOfTheGame: null },
        voteResults: [makeVoteResult(0, votes, authors, texts)],
      }],
      awards: [],
    };

    const server = makeServer(players, series);
    const awards = computeSeriesAwards(server);

    // Every award should have a detail string
    for (const award of awards) {
      expect(award.detail).toBeTruthy();
    }
  });
});
