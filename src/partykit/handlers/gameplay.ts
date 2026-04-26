import type * as Party from "partykit/server";
import type { GameAction } from "@/lib/game/types";
import type { ClientMessage } from "@/lib/multiplayer/types";
import { gameReducer, assembleStories } from "@/lib/game";
import type RoomServer from "../room";
import {
  ROUND_TIMER_FIRST_GAME_MS,
  ROUND_TIMER_SUBSEQUENT_MS,
} from "../constants";
import { computeAndBroadcastScores } from "./voting";

export function handleStartGame(
  server: RoomServer,
  msg: Extract<ClientMessage, { type: "START_GAME" }>,
  sender: Party.Connection
) {
  if (!server.gameState) return;

  const playerId = server.connectionToPlayer.get(sender.id);
  if (!playerId || playerId !== server.gameState.hostId) {
    server.sendTo(sender, {
      type: "ERROR",
      reason: "Only the host can start the game",
    });
    return;
  }

  // Set game mode before starting
  const mode = msg.mode ?? "classic";
  server.gameState = { ...server.gameState, gameMode: mode };

  // Block competitive mode for free rooms
  if (mode === "competitive" && !server.gameState.isPremium) {
    server.sendTo(sender, {
      type: "ERROR",
      reason: "Competitive mode requires a premium upgrade",
    });
    return;
  }

  // Initialize series state for competitive mode
  if (mode === "competitive") {
    const totalGames = msg.seriesLength ?? 3;
    const currentGameNumber = server.seriesState
      ? server.seriesState.currentGameNumber + 1
      : 1;

    if (!server.seriesState) {
      server.seriesState = {
        mode: "competitive",
        totalGames,
        currentGameNumber: 1,
        cumulativePoints: {},
        standingOvationsUsed: {},
        completedGames: [],
        awards: [],
      };
    } else {
      server.seriesState.currentGameNumber = currentGameNumber;
      server.seriesState.standingOvationsUsed = {};
    }

    server.gameState.series = server.seriesState;
  }

  // Reset per-game vote state
  server.currentVotes.clear();
  server.gameVoteResults = [];

  const now = Date.now();
  const action: GameAction = {
    type: "GAME_STARTED",
    hostId: playerId,
    timestamp: now,
  };
  const newState = gameReducer(server.gameState, action);

  if (newState === server.gameState) {
    server.sendTo(sender, {
      type: "ERROR",
      reason: "Cannot start game (need at least 4 players)",
    });
    return;
  }

  server.gameState = newState;

  // Reset all player statuses to idle
  for (const p of server.gameState.players) {
    if (server.playerStatuses.get(p.id) !== "disconnected" && server.playerStatuses.get(p.id) !== "reconnecting") {
      server.playerStatuses.set(p.id, "idle");
    }
  }

  startRoundTimer(server);
  server.broadcastStateUpdate();
  server.broadcastPlayerStatuses();
}

export function handleSubmitPrompt(
  server: RoomServer,
  msg: Extract<ClientMessage, { type: "SUBMIT_PROMPT" }>,
  sender: Party.Connection
) {
  if (!server.gameState) return;

  const playerId = server.connectionToPlayer.get(sender.id);
  if (!playerId) return;

  const action: GameAction = {
    type: "PROMPT_SUBMITTED",
    playerId,
    storyIndex: msg.storyIndex,
    promptIndex: msg.promptIndex,
    response: msg.response,
  };

  const prevRound = server.gameState.currentRound;
  const newState = gameReducer(server.gameState, action);
  if (newState === server.gameState) {
    server.sendTo(sender, {
      type: "ERROR",
      reason: "Invalid submission",
    });
    return;
  }

  server.gameState = newState;

  // Update player status to submitted
  server.playerStatuses.set(playerId, "submitted");

  // Check if game moved to REVEAL
  if (newState.state === "REVEAL") {
    clearRoundTimer(server);
    server.initRevealState();
    const stories = assembleStories(newState);
    server.broadcast({ type: "ASSEMBLED_STORIES", stories });
    server.broadcastRevealState();
  } else if (newState.currentRound > prevRound && newState.state === "PLAYING") {
    resetPlayerStatusesForNewRound(server);
    startRoundTimer(server);
  } else if (newState.state === "PLAYING" && newState.currentRound === prevRound) {
    const currentRound = newState.currentRound;
    const allConnectedSubmitted = newState.stories.every((s) => {
      const slot = s.slots[currentRound];
      if (!slot || slot.response !== null) return true;
      return !server.playerToConnection.has(slot.playerId ?? "");
    });
    if (allConnectedSubmitted) {
      const unsubmittedCount = newState.stories.filter(
        (s) => s.slots[currentRound]?.response === null
      ).length;
      server.broadcast({ type: "ADVANCE_AVAILABLE", unsubmittedCount });
    }
  }

  server.broadcastStateUpdate();
  server.broadcastPlayerStatuses();
}

export function handleHostAdvance(server: RoomServer, sender: Party.Connection) {
  if (!server.gameState) return;

  const playerId = server.connectionToPlayer.get(sender.id);
  if (!playerId || playerId !== server.gameState.hostId) {
    server.sendTo(sender, {
      type: "ERROR",
      reason: "Only the host can advance",
    });
    return;
  }

  const now = Date.now();
  const prevState = server.gameState;
  const action: GameAction = {
    type: "HOST_ADVANCED",
    hostId: playerId,
    timestamp: now,
  };
  const newState = gameReducer(server.gameState, action);
  server.gameState = newState;

  if (newState.state === "REVEAL") {
    clearRoundTimer(server);
    server.initRevealState();
    const stories = assembleStories(newState);
    server.broadcast({ type: "ASSEMBLED_STORIES", stories });
    server.broadcastRevealState();
  } else if (newState.currentRound > prevState.currentRound) {
    resetPlayerStatusesForNewRound(server);
    startRoundTimer(server);
  }

  server.broadcastStateUpdate();
  server.broadcastPlayerStatuses();
}

export function handleAdvanceReveal(server: RoomServer, sender: Party.Connection) {
  if (!server.gameState) return;
  if (server.gameState.state !== "REVEAL") return;

  const playerId = server.connectionToPlayer.get(sender.id);
  if (!playerId) return;

  const isHost = playerId === server.gameState.hostId;

  const currentStory = server.gameState.stories[server.revealStoryIndex];
  const readerSlot = currentStory?.slots.find((s) => s.promptIndex === 6);
  const isReader = readerSlot?.playerId === playerId;

  if (!isHost && !isReader) {
    server.sendTo(sender, {
      type: "ERROR",
      reason: "Only the host or current reader can advance to the next story",
    });
    return;
  }

  const targetStoryIndex =
    currentStory && !currentStory.isRevealed
      ? currentStory.index
      : undefined;

  if (targetStoryIndex === undefined) return;

  const now = Date.now();
  const action: GameAction = {
    type: "STORY_REVEALED",
    storyIndex: targetStoryIndex,
    timestamp: now,
  };
  server.gameState = gameReducer(server.gameState, action);

  const currentPos = server.revealOrder.indexOf(server.revealStoryIndex);
  const nextIdx = server.revealOrder[currentPos + 1];
  if (nextIdx !== undefined) {
    server.revealStoryIndex = nextIdx;
    server.revealedLineCount = 0;
    server.broadcastRevealState();
  }

  server.broadcastStateUpdate();

  // Archive when game transitions to END (all stories revealed)
  if (server.gameState.state === "END") {
    server.archiveRoom();
    if (server.gameState.gameMode === "competitive") {
      computeAndBroadcastScores(server);
    }
  }
}

export function handleRevealAdvance(server: RoomServer, sender: Party.Connection) {
  if (!server.gameState) return;
  if (server.gameState.state !== "REVEAL") return;

  const playerId = server.connectionToPlayer.get(sender.id);
  if (!playerId) return;

  const currentStory = server.gameState.stories[server.revealStoryIndex];
  if (!currentStory) return;

  const readerSlot = currentStory.slots.find(s => s.promptIndex === 6);
  const readerId = readerSlot?.playerId;

  if (playerId !== readerId) {
    const senderIsHost = playerId === server.gameState.hostId;
    if (!senderIsHost) {
      server.sendTo(sender, {
        type: "ERROR",
        reason: "Only the reader or host can advance the reveal",
      });
      return;
    }
  }

  if (server.revealedLineCount >= 7) {
    return;
  }

  server.revealedLineCount++;

  server.broadcastRevealState();
  server.broadcastStateUpdate();
}

export function handleEndGame(server: RoomServer, sender: Party.Connection) {
  if (!server.gameState) return;

  const now = Date.now();
  const action: GameAction = { type: "GAME_ENDED", timestamp: now };
  server.gameState = gameReducer(server.gameState, action);

  clearRoundTimer(server);
  server.broadcastStateUpdate();

  if (server.gameState.state === "END") {
    server.archiveRoom();
    if (server.gameState.gameMode === "competitive") {
      computeAndBroadcastScores(server);
    }
  }
}

export function handleTypingStatus(
  server: RoomServer,
  msg: Extract<ClientMessage, { type: "TYPING_STATUS" }>,
  sender: Party.Connection
) {
  const playerId = server.connectionToPlayer.get(sender.id);
  if (!playerId) return;

  const currentStatus = server.playerStatuses.get(playerId);
  if (currentStatus === "submitted") return;

  server.playerStatuses.set(playerId, msg.status);
  server.broadcastPlayerStatuses(true); // skip save — typing is ephemeral
}

// --- Timer helpers ---

export function startRoundTimer(server: RoomServer) {
  clearRoundTimer(server);
  server.roundStartTime = Date.now();
  server.roundStartedAt = Date.now();

  server.roundTimer = setTimeout(() => {
    if (!server.gameState || server.gameState.state !== "PLAYING") return;

    const currentRound = server.gameState.currentRound;
    const unsubmittedCount = server.gameState.stories.filter(
      (s) => s.slots[currentRound]?.response === null
    ).length;

    server.broadcast({
      type: "ADVANCE_AVAILABLE",
      unsubmittedCount,
    });
  }, roundTimerMs(server));
}

/** 90s for the first game of a series, 60s for subsequent games. Classic mode always uses 90s. */
export function roundTimerMs(server: RoomServer): number {
  if (server.seriesState && server.seriesState.currentGameNumber > 1) {
    return ROUND_TIMER_SUBSEQUENT_MS;
  }
  return ROUND_TIMER_FIRST_GAME_MS;
}

export function clearRoundTimer(server: RoomServer) {
  if (server.roundTimer) {
    clearTimeout(server.roundTimer);
    server.roundTimer = null;
  }
  server.roundStartTime = null;
  server.roundStartedAt = null;
}

export function resetPlayerStatusesForNewRound(server: RoomServer) {
  if (!server.gameState) return;
  for (const p of server.gameState.players) {
    const current = server.playerStatuses.get(p.id);
    if (current !== "disconnected" && current !== "reconnecting") {
      server.playerStatuses.set(p.id, "idle");
    }
  }
}
