import type { Connection } from "partyserver";
import type { GameAction, Vote, StoryVoteResult, GameScores, SeriesAward } from "@/lib/game/types";
import type { ClientMessage, ServerMessage } from "@/lib/multiplayer/types";
import { gameReducer } from "@/lib/game";
import type RoomServer from "../room";
import { VOTING_DURATION_MS } from "../constants";

export function handleStartVoting(server: RoomServer, sender: Connection) {
  if (!server.gameState) return;
  if (server.gameState.state !== "REVEAL") return;
  if (server.gameState.gameMode !== "competitive") return;

  const playerId = server.connectionToPlayer.get(sender.id);
  if (!playerId) return;

  const currentStory = server.gameState.stories[server.revealStoryIndex];
  const readerSlot = currentStory?.slots.find((s) => s.promptIndex === 6);
  const readerId = readerSlot?.playerId;
  const isHost = playerId === server.gameState.hostId;
  if (playerId !== readerId && !isHost) return;

  if (
    server.gameState.votingState?.storyIndex === server.revealStoryIndex &&
    server.gameState.votingState?.phase === "voting"
  ) {
    return;
  }

  server.currentVotes.clear();

  const now = Date.now();
  server.votingStartedAt = now;
  server.gameState = {
    ...server.gameState,
    votingState: {
      storyIndex: server.revealStoryIndex,
      phase: "voting",
      votesReceived: [],
      votingStartedAt: now,
    },
  };

  server.broadcastToAll({
    type: "VOTING_OPEN",
    storyIndex: server.revealStoryIndex,
    votingStartedAt: now,
    votingDurationMs: VOTING_DURATION_MS,
  });

  clearVotingTimer(server);
  server.broadcastStateUpdate();
}

export function handleSubmitVote(
  server: RoomServer,
  msg: Extract<ClientMessage, { type: "SUBMIT_VOTE" }>,
  sender: Connection
) {
  if (!server.gameState) return;
  if (server.gameState.state !== "REVEAL") return;
  if (server.gameState.gameMode !== "competitive") return;
  if (server.gameState.votingState?.phase !== "voting") return;
  if (msg.storyIndex !== server.gameState.votingState.storyIndex) return;

  const playerId = server.connectionToPlayer.get(sender.id);
  if (!playerId) return;

  // Only active players may vote — pending spectators must not.
  if (!server.gameState.players.some((p) => p.id === playerId)) {
    server.sendTo(sender, {
      type: "ERROR",
      reason: "Spectators cannot vote",
    });
    return;
  }

  // Validate lineIndex is an in-range integer (there are 7 lines, 0-6).
  if (
    !Number.isInteger(msg.lineIndex) ||
    msg.lineIndex < 0 ||
    msg.lineIndex > 6
  ) {
    server.sendTo(sender, { type: "ERROR", reason: "Invalid line" });
    return;
  }

  const currentStory = server.gameState.stories[server.revealStoryIndex];
  if (!currentStory) return;
  const slot = currentStory.slots[msg.lineIndex];
  if (slot?.playerId === playerId) {
    server.sendTo(sender, { type: "ERROR", reason: "Cannot vote for your own line" });
    return;
  }

  if (msg.isStandingOvation) {
    if (server.seriesState?.standingOvationsUsed[playerId]) {
      server.sendTo(sender, { type: "ERROR", reason: "Standing ovation already used this game" });
      return;
    }
  }

  server.currentVotes.set(playerId, {
    lineIndex: msg.lineIndex,
    isStandingOvation: msg.isStandingOvation,
  });

  // NOTE: standingOvationsUsed is committed at tally time (handleAdvanceVoting),
  // not here — otherwise casting an ovation then changing to a regular vote
  // before the round closes would silently burn the once-per-game ovation.
  // The check above still rejects a second ovation across already-tallied rounds.

  const votesReceived = Array.from(server.currentVotes.keys());
  server.gameState = {
    ...server.gameState,
    votingState: {
      ...server.gameState.votingState!,
      votesReceived,
    },
  };

  server.broadcastStateUpdate();
}

export async function handleAdvanceVoting(server: RoomServer, sender: Connection) {
  if (!server.gameState) return;
  if (server.gameState.state !== "REVEAL") return;
  if (server.gameState.votingState?.phase !== "voting") return;

  const playerId = server.connectionToPlayer.get(sender.id);
  if (!playerId || playerId !== server.gameState.hostId) return;
  clearVotingTimer(server);

  const storyIndex = server.revealStoryIndex;
  const currentStory = server.gameState.stories[storyIndex];
  if (!currentStory) { console.error("[voting] no story at index", storyIndex); return; }

  // Only real votes are tallied — players who don't vote simply abstain.
  // (No votes at all → the no-winner guard below records no winning line.)

  // Tally all votes
  const lineTallies: number[] = new Array(7).fill(0);
  const votes: Vote[] = [];

  for (const [voterId, vote] of server.currentVotes) {
    const points = vote.isStandingOvation ? 3 : 1;
    lineTallies[vote.lineIndex] += points;
    // Commit the once-per-game ovation now, based on the final vote.
    if (vote.isStandingOvation && server.seriesState) {
      server.seriesState.standingOvationsUsed[voterId] = true;
    }
    votes.push({
      voterId,
      storyIndex,
      lineIndex: vote.lineIndex,
      isStandingOvation: vote.isStandingOvation,
    });
  }

  let winningLineIndex = 0;
  let maxTally = 0;
  for (let i = 0; i < lineTallies.length; i++) {
    if (lineTallies[i] > maxTally) {
      maxTally = lineTallies[i];
      winningLineIndex = i;
    }
  }

  // Guard the no-votes case: if nothing was tallied, there is no winner —
  // don't record line 0's author as a 0-tally winner.
  const hasWinner = maxTally > 0;
  const winningSlot = hasWinner
    ? currentStory.slots[winningLineIndex]
    : undefined;
  const winningAuthorId = winningSlot?.playerId ?? "";

  // Build the per-line author/text snapshot. Skip placeholder slots: they were
  // auto-filled for a player who didn't submit, so that player must not be
  // credited (or win awards) for a line they didn't write.
  const lineAuthors: Record<number, string> = {};
  const lineTexts: Record<number, string> = {};
  for (let i = 0; i < currentStory.slots.length; i++) {
    const s = currentStory.slots[i];
    if (s?.isPlaceholder) continue;
    if (s?.playerId) {
      lineAuthors[i] = s.playerId;
    }
    if (s?.response) {
      lineTexts[i] = s.response;
    }
  }

  server.gameVoteResults.push({
    storyIndex,
    votes,
    winningLineIndex: hasWinner ? winningLineIndex : -1,
    winningAuthorId,
    winningLineText: winningSlot?.response ?? "",
    lineAuthors,
    lineTexts,
  });

  server.currentVotes.clear();

  server.broadcastToAll({ type: "VOTING_CLOSED", storyIndex } as ServerMessage);

  await advanceAfterVoting(server);
}

async function advanceAfterVoting(server: RoomServer) {
  if (!server.gameState || server.gameState.state !== "REVEAL") return;

  const storyIndex = server.revealStoryIndex;

  const action: GameAction = {
    type: "STORY_REVEALED",
    storyIndex,
    timestamp: Date.now(),
  };
  server.gameState = gameReducer(server.gameState, action);

  server.gameState = {
    ...server.gameState,
    votingState: undefined,
  };

  const currentPos = server.revealOrder.indexOf(server.revealStoryIndex);
  const nextIdx = server.revealOrder[currentPos + 1];
  if (nextIdx !== undefined) {
    server.revealStoryIndex = nextIdx;
    server.revealedLineCount = 0;
    server.broadcastRevealState();
  }

  server.broadcastStateUpdate();

  if (server.gameState.state === "END") {
    await server.archiveRoom();
    if (server.gameState.gameMode === "competitive") {
      computeAndBroadcastScores(server);
    }
  }
}

export function clearVotingTimer(server: RoomServer) {
  if (server.votingTimer) {
    clearTimeout(server.votingTimer);
    server.votingTimer = null;
  }
  server.votingStartedAt = null;
}

export function computeAndBroadcastScores(server: RoomServer) {
  if (!server.gameState || !server.seriesState) return;

  // Idempotency: this can be reached from several END transitions
  // (END_GAME, final STORY_REVEALED, advanceAfterVoting). If we've already
  // recorded this game's scores, do nothing — otherwise points and
  // completedGames would be double-counted.
  const gameNumber = server.seriesState.currentGameNumber;
  if (server.seriesState.completedGames.some((g) => g.gameNumber === gameNumber)) {
    return;
  }

  const points: Record<string, number> = {};
  for (const p of server.gameState.players) {
    points[p.id] = 0;
  }

  let lineOfTheGame: GameScores["lineOfTheGame"] = null;
  let maxVoteCount = 0;

  for (const result of server.gameVoteResults) {
    for (const vote of result.votes) {
      const authorId = result.lineAuthors[vote.lineIndex];
      if (!authorId) continue;

      if (vote.isStandingOvation) {
        points[authorId] = (points[authorId] ?? 0) + 3;
        points[vote.voterId] = (points[vote.voterId] ?? 0) + 2;
      } else {
        points[authorId] = (points[authorId] ?? 0) + 1;
      }
    }

    const linePoints: number[] = new Array(7).fill(0);
    for (const vote of result.votes) {
      linePoints[vote.lineIndex] += vote.isStandingOvation ? 3 : 1;
    }
    for (let i = 0; i < linePoints.length; i++) {
      if (linePoints[i] > maxVoteCount) {
        const slot = server.gameState.stories[result.storyIndex]?.slots[i];
        // Placeholder lines can't be Line of the Game.
        if (slot?.isPlaceholder) continue;
        maxVoteCount = linePoints[i];
        const authorId = result.lineAuthors[i] ?? "";
        const author = server.gameState.players.find((p) => p.id === authorId);
        lineOfTheGame = {
          storyIndex: result.storyIndex,
          lineIndex: i,
          text: slot?.response ?? "",
          authorId: slot?.playerId ?? "",
          authorName: author?.name ?? "Unknown",
          points: linePoints[i],
        };
      }
    }
  }

  const isFinalGame =
    server.seriesState.currentGameNumber >= server.seriesState.totalGames;
  if (isFinalGame) {
    for (const id of Object.keys(points)) {
      points[id] *= 2;
    }
  }

  const gameScores: GameScores = {
    points,
    lineOfTheGame,
  };

  for (const [id, pts] of Object.entries(points)) {
    server.seriesState.cumulativePoints[id] =
      (server.seriesState.cumulativePoints[id] ?? 0) + pts;
  }

  server.seriesState.completedGames.push({
    gameNumber: server.seriesState.currentGameNumber,
    scores: gameScores,
    voteResults: [...server.gameVoteResults],
  });

  server.broadcastToAll({
    type: "GAME_SCORES",
    scores: gameScores,
    voteResults: server.gameVoteResults,
    gameNumber: server.seriesState.currentGameNumber,
    seriesStandings: { ...server.seriesState.cumulativePoints },
  });

  if (isFinalGame) {
    const awards = computeSeriesAwards(server);
    server.seriesState.awards = awards;
  }
}

export function computeSeriesAwards(server: RoomServer): SeriesAward[] {
  if (!server.gameState || !server.seriesState) return [];

  const awards: SeriesAward[] = [];
  const players = server.gameState.players;
  const allResults = server.seriesState.completedGames.flatMap((g) => g.voteResults);

  const pointsByPlayerByActs = (acts: number[]) => {
    const counts: Record<string, number> = {};
    for (const result of allResults) {
      for (const vote of result.votes) {
        if (acts.includes(vote.lineIndex)) {
          const authorId = result.lineAuthors[vote.lineIndex];
          if (authorId) {
            const pts = vote.isStandingOvation ? 3 : 1;
            counts[authorId] = (counts[authorId] ?? 0) + pts;
          }
        }
      }
    }
    return counts;
  };

  const nameOf = (id: string) =>
    players.find((p) => p.id === id)?.name ?? "Unknown";

  // Find the player with the highest count.
  // Tie-break 1: fewer awards already → spread the love
  // Tie-break 2: alphabetical by name
  const findTop = (counts: Record<string, number>) => {
    let topId = "";
    let topCount = 0;
    for (const [id, count] of Object.entries(counts)) {
      if (count > topCount) {
        topCount = count;
        topId = id;
      } else if (count === topCount && topId) {
        const existingAwards = awards.filter((a) => a.playerId === id).length;
        const topAwards = awards.filter((a) => a.playerId === topId).length;
        if (
          existingAwards < topAwards ||
          (existingAwards === topAwards && nameOf(id) < nameOf(topId))
        ) {
          topId = id;
        }
      }
    }
    return topId;
  };

  // Casting Director
  const castingCounts = pointsByPlayerByActs([0, 1]);
  const castingId = findTop(castingCounts);
  if (castingId) {
    awards.push({
      id: "casting-director",
      title: "Casting Director",
      playerId: castingId,
      playerName: nameOf(castingId),
      detail: `${castingCounts[castingId]} pts on character intros`,
    });
  }

  // Scene Stealer
  const sceneCounts = pointsByPlayerByActs([2, 3]);
  const sceneId = findTop(sceneCounts);
  if (sceneId) {
    awards.push({
      id: "scene-stealer",
      title: "Scene Stealer",
      playerId: sceneId,
      playerName: nameOf(sceneId),
      detail: `${sceneCounts[sceneId]} pts on settings & actions`,
    });
  }

  // Speechwriter
  const speechCounts = pointsByPlayerByActs([4, 5]);
  const speechId = findTop(speechCounts);
  if (speechId) {
    awards.push({
      id: "speechwriter",
      title: "Speechwriter",
      playerId: speechId,
      playerName: nameOf(speechId),
      detail: `${speechCounts[speechId]} pts on dialogue`,
    });
  }

  // Closer
  const closerCounts = pointsByPlayerByActs([6]);
  const closerId = findTop(closerCounts);
  if (closerId) {
    awards.push({
      id: "closer",
      title: "Closer",
      playerId: closerId,
      playerName: nameOf(closerId),
      detail: `${closerCounts[closerId]} pts on endings`,
    });
  }

  // Fan Favorite
  const ovationCounts: Record<string, number> = {};
  for (const result of allResults) {
    for (const vote of result.votes) {
      if (vote.isStandingOvation) {
        const authorId = result.lineAuthors[vote.lineIndex];
        if (authorId) {
          ovationCounts[authorId] = (ovationCounts[authorId] ?? 0) + 1;
        }
      }
    }
  }
  const fanFavId = findTop(ovationCounts);
  if (fanFavId) {
    const count = ovationCounts[fanFavId];
    awards.push({
      id: "fan-favorite",
      title: "Fan Favorite",
      playerId: fanFavId,
      playerName: nameOf(fanFavId),
      detail: `${count} standing ovation${count !== 1 ? "s" : ""} received`,
    });
  }

  // Line of the Series
  let bestLineText = "";
  let bestLineAuthorId = "";
  let bestLinePoints = 0;
  for (const result of allResults) {
    const linePoints: number[] = new Array(7).fill(0);
    for (const vote of result.votes) {
      linePoints[vote.lineIndex] += vote.isStandingOvation ? 3 : 1;
    }
    for (let i = 0; i < linePoints.length; i++) {
      if (linePoints[i] > bestLinePoints) {
        bestLinePoints = linePoints[i];
        bestLineAuthorId = result.lineAuthors[i] ?? "";
        bestLineText = result.lineTexts[i] ?? "";
      }
    }
  }
  if (bestLineAuthorId) {
    awards.push({
      id: "line-of-the-series",
      title: "Line of the Series",
      playerId: bestLineAuthorId,
      playerName: nameOf(bestLineAuthorId),
      detail: bestLineText,
    });
  }

  // Popularity
  const nameCounts: Record<string, number> = {};
  const extractCharName = (text: string) => {
    for (const sep of [" \u2014 ", " \u2013 ", " - "]) {
      const idx = text.indexOf(sep);
      if (idx !== -1) return text.slice(0, idx).trim().toLowerCase();
    }
    return text.trim().toLowerCase();
  };
  for (const game of server.seriesState.completedGames) {
    for (const result of game.voteResults) {
      for (const slotIdx of [0, 1]) {
        const charText = result.lineTexts[slotIdx];
        if (!charText) continue;
        const charName = extractCharName(charText);
        const matchedPlayer = players.find(
          (p) => p.name.toLowerCase() === charName
        );
        if (matchedPlayer) {
          nameCounts[matchedPlayer.id] =
            (nameCounts[matchedPlayer.id] ?? 0) + 1;
        }
      }
    }
  }
  const popularId = findTop(nameCounts);
  if (popularId) {
    const count = nameCounts[popularId];
    awards.push({
      id: "popularity",
      title: "Popularity",
      playerId: popularId,
      playerName: nameOf(popularId),
      detail: `Featured in ${count} stor${count !== 1 ? "ies" : "y"}`,
    });
  }

  return awards;
}
