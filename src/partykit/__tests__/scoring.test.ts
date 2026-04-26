import { describe, it, expect } from "vitest";
import { computeAndBroadcastScores, computeSeriesAwards } from "../handlers/voting";
import type { Player, SeriesState, StoryVoteResult, Vote, Story, PromptSlot } from "@/lib/game/types";
import type { ServerMessage } from "@/lib/multiplayer/types";

// ── Test helpers ──

function makeVote(voterId: string, storyIndex: number, lineIndex: number, isStandingOvation = false): Vote {
  return { voterId, storyIndex, lineIndex, isStandingOvation };
}

function makeSlot(storyIndex: number, promptIndex: number, playerId: string, response: string): PromptSlot {
  return { storyIndex, promptIndex, playerId, response, isPlaceholder: false };
}

function makeStory(index: number, playerIds: string[], responses: string[]): Story {
  return {
    index,
    slots: playerIds.map((pid, i) => makeSlot(index, i, pid, responses[i])),
    isRevealed: true,
  };
}

function makeVoteResult(
  storyIndex: number,
  votes: Vote[],
  lineAuthors: Record<number, string>,
  lineTexts: Record<number, string>
): StoryVoteResult {
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

const lineAuthors: Record<number, string> = {
  0: "p1", 1: "p2", 2: "p3", 3: "p4", 4: "p1", 5: "p2", 6: "p3",
};
const lineTexts: Record<number, string> = {
  0: "Alice — spy", 1: "Bob — chef", 2: "at park", 3: "running",
  4: "Best line", 5: "Ok line", 6: "The end",
};

function makeServer(opts: {
  players?: Player[];
  stories?: Story[];
  voteResults?: StoryVoteResult[];
  currentGameNumber?: number;
  totalGames?: number;
  cumulativePoints?: Record<string, number>;
}) {
  const p = opts.players ?? players;
  const broadcasted: ServerMessage[] = [];

  return {
    gameState: {
      players: p,
      stories: opts.stories ?? [makeStory(0, p.map(pl => pl.id).concat(["p1", "p2", "p3"]), [
        "Alice — spy", "Bob — chef", "at park", "running", "Best line", "Ok line", "The end",
      ])],
      gameMode: "competitive",
      state: "END",
    },
    seriesState: {
      mode: "competitive",
      totalGames: opts.totalGames ?? 3,
      currentGameNumber: opts.currentGameNumber ?? 1,
      cumulativePoints: opts.cumulativePoints ?? {},
      standingOvationsUsed: {},
      completedGames: [],
      awards: [],
    } as SeriesState,
    gameVoteResults: opts.voteResults ?? [],
    broadcast(msg: ServerMessage) { broadcasted.push(msg); },
    broadcasted,
  } as any;
}

// ── Scoring tests ──

describe("computeAndBroadcastScores", () => {
  it("awards 1 point to the author for a normal vote", () => {
    const votes = [makeVote("p2", 0, 0)]; // p2 votes for line 0 (authored by p1)
    const result = makeVoteResult(0, votes, lineAuthors, lineTexts);
    const server = makeServer({ voteResults: [result] });

    computeAndBroadcastScores(server);

    const msg = server.broadcasted.find((m: any) => m.type === "GAME_SCORES") as any;
    expect(msg.scores.points["p1"]).toBe(1); // author gets 1
    expect(msg.scores.points["p2"]).toBe(0); // voter gets 0
  });

  it("awards 3 to author and 2 to voter for standing ovation", () => {
    const votes = [makeVote("p2", 0, 0, true)]; // standing ovation for p1's line
    const result = makeVoteResult(0, votes, lineAuthors, lineTexts);
    const server = makeServer({ voteResults: [result] });

    computeAndBroadcastScores(server);

    const msg = server.broadcasted.find((m: any) => m.type === "GAME_SCORES") as any;
    expect(msg.scores.points["p1"]).toBe(3); // author gets 3
    expect(msg.scores.points["p2"]).toBe(2); // voter gets 2
  });

  it("doubles points for the final game", () => {
    const votes = [
      makeVote("p2", 0, 0),     // 1 pt to p1
      makeVote("p3", 0, 4),     // 1 pt to p1
    ];
    const result = makeVoteResult(0, votes, lineAuthors, lineTexts);
    const server = makeServer({
      voteResults: [result],
      currentGameNumber: 3,
      totalGames: 3,
    });

    computeAndBroadcastScores(server);

    const msg = server.broadcasted.find((m: any) => m.type === "GAME_SCORES") as any;
    expect(msg.scores.points["p1"]).toBe(4); // 2 pts × 2 = 4
  });

  it("does NOT double points for non-final games", () => {
    const votes = [makeVote("p2", 0, 0)];
    const result = makeVoteResult(0, votes, lineAuthors, lineTexts);
    const server = makeServer({
      voteResults: [result],
      currentGameNumber: 1,
      totalGames: 3,
    });

    computeAndBroadcastScores(server);

    const msg = server.broadcasted.find((m: any) => m.type === "GAME_SCORES") as any;
    expect(msg.scores.points["p1"]).toBe(1); // not doubled
  });

  it("accumulates points across multiple stories", () => {
    const authors2: Record<number, string> = { ...lineAuthors, 0: "p3" }; // p3 wrote line 0 in story 2
    const votes1 = [makeVote("p2", 0, 0)]; // 1 pt to p1
    const votes2 = [makeVote("p2", 1, 0)]; // 1 pt to p3
    const result1 = makeVoteResult(0, votes1, lineAuthors, lineTexts);
    const result2 = makeVoteResult(1, votes2, authors2, lineTexts);
    const server = makeServer({ voteResults: [result1, result2] });

    computeAndBroadcastScores(server);

    const msg = server.broadcasted.find((m: any) => m.type === "GAME_SCORES") as any;
    expect(msg.scores.points["p1"]).toBe(1);
    expect(msg.scores.points["p3"]).toBe(1);
  });

  it("identifies Line of the Game as highest-scoring line", () => {
    const votes = [
      makeVote("p2", 0, 4), // line 4 gets 1
      makeVote("p3", 0, 4), // line 4 gets 2
      makeVote("p4", 0, 0), // line 0 gets 1
    ];
    const result = makeVoteResult(0, votes, lineAuthors, lineTexts);
    const server = makeServer({ voteResults: [result] });

    computeAndBroadcastScores(server);

    const msg = server.broadcasted.find((m: any) => m.type === "GAME_SCORES") as any;
    expect(msg.scores.lineOfTheGame).toBeDefined();
    expect(msg.scores.lineOfTheGame.lineIndex).toBe(4);
    expect(msg.scores.lineOfTheGame.points).toBe(2);
  });

  it("updates cumulative series standings", () => {
    const votes = [makeVote("p2", 0, 0)]; // 1 pt to p1
    const result = makeVoteResult(0, votes, lineAuthors, lineTexts);
    const server = makeServer({
      voteResults: [result],
      cumulativePoints: { p1: 5, p2: 3 },
    });

    computeAndBroadcastScores(server);

    expect(server.seriesState.cumulativePoints["p1"]).toBe(6); // 5 + 1
    expect(server.seriesState.cumulativePoints["p2"]).toBe(3); // unchanged
  });
});

// ── Tie-breaking tests ──

describe("award tie-breaking", () => {
  it("breaks ties alphabetically by player name", () => {
    // Both p1 (Alice) and p2 (Bob) get 1 point on character intros
    const votes = [
      makeVote("p3", 0, 0), // 1 pt to p1 (line 0, character intro)
      makeVote("p4", 0, 1), // 1 pt to p2 (line 1, character intro)
    ];
    const result = makeVoteResult(0, votes, lineAuthors, lineTexts);

    const series: SeriesState = {
      mode: "competitive",
      totalGames: 1,
      currentGameNumber: 1,
      cumulativePoints: {},
      standingOvationsUsed: {},
      completedGames: [{
        gameNumber: 1,
        scores: { points: {}, lineOfTheGame: null },
        voteResults: [result],
      }],
      awards: [],
    };

    const server = { gameState: { players }, seriesState: series } as any;
    const awards = computeSeriesAwards(server);
    const casting = awards.find((a) => a.id === "casting-director");

    // Alice < Bob alphabetically, so Alice wins the tie
    expect(casting?.playerId).toBe("p1");
    expect(casting?.playerName).toBe("Alice");
  });

  it("does not break tie when one player is clearly ahead", () => {
    // p2 (Bob) gets 2 points, p1 (Alice) gets 1
    const votes = [
      makeVote("p3", 0, 1), // 1 pt to p2
      makeVote("p4", 0, 1), // 1 pt to p2 (total: 2)
      makeVote("p1", 0, 0), // 1 pt to p1... wait, p1 wrote line 0, can't self-vote
    ];
    // Actually: p3 votes for line 1 (p2), p4 votes for line 1 (p2), p1 votes for line 1 (p2)
    const votes2 = [
      makeVote("p3", 0, 0), // 1 pt to p1
      makeVote("p4", 0, 1), // 1 pt to p2
      makeVote("p1", 0, 1), // 1 pt to p2 (total: p2=2, p1=1)
    ];
    const result = makeVoteResult(0, votes2, lineAuthors, lineTexts);

    const series: SeriesState = {
      mode: "competitive",
      totalGames: 1,
      currentGameNumber: 1,
      cumulativePoints: {},
      standingOvationsUsed: {},
      completedGames: [{
        gameNumber: 1,
        scores: { points: {}, lineOfTheGame: null },
        voteResults: [result],
      }],
      awards: [],
    };

    const server = { gameState: { players }, seriesState: series } as any;
    const awards = computeSeriesAwards(server);
    const casting = awards.find((a) => a.id === "casting-director");

    // Bob clearly ahead with 2 pts
    expect(casting?.playerId).toBe("p2");
    expect(casting?.playerName).toBe("Bob");
  });
});
