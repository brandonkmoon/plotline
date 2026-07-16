import type { Connection } from "partyserver";
import type { GameAction } from "@/lib/game/types";
import type { ClientMessage, ServerMessage } from "@/lib/multiplayer/types";
import { gameReducer, createRoom, generateRoomCode } from "@/lib/game";
import type RoomServer from "../room";
import { MAX_PLAYERS } from "../constants";
import { clearRoundTimer } from "./gameplay";
import { computeAndBroadcastScores } from "./voting";

export function handlePlayAgain(server: RoomServer, sender: Connection) {
  if (!server.gameState) return;
  if (server.gameState.state !== "END" && server.gameState.state !== "REVEAL")
    return;

  const senderPlayerId = server.connectionToPlayer.get(sender.id);
  const senderPlayer = senderPlayerId
    ? server.gameState.players.find((p) => p.id === senderPlayerId)
    : null;

  const isHost = senderPlayerId === server.gameState.hostId;
  const isMidSeries = server.seriesState &&
    server.seriesState.currentGameNumber < server.seriesState.totalGames;
  const isFinalCompetitive = server.seriesState &&
    server.seriesState.currentGameNumber >= server.seriesState.totalGames;

  // Classic mode during REVEAL: only the host may restart, so a single queued
  // player can't cut the reveal short and reset the room for the whole group.
  // At END, the normal queued-player path below applies.
  if (!server.seriesState && server.gameState.state === "REVEAL" && !isHost) {
    server.sendTo(sender, {
      type: "ERROR",
      reason: "Only the host can start the next game during the reveal",
    });
    return;
  }

  // Final competitive game: host advances to the awards ceremony — but only
  // once the game has actually ended and awards are computed. Advancing during
  // REVEAL would broadcast an empty awards list.
  if (isFinalCompetitive && isHost) {
    if (server.gameState.state === "END") {
      autoAdvanceAfterReady(server);
    }
    return;
  }

  // In competitive mid-series, the host can advance directly
  if (isMidSeries && isHost) {
    server.gameState = {
      ...server.gameState,
      players: server.gameState.players.map((p) => ({
        ...p,
        queuedForNextGame: p.isConnected ? true : p.queuedForNextGame,
      })),
    };
  } else if (!senderPlayer || !senderPlayer.queuedForNextGame) {
    server.sendTo(sender, {
      type: "ERROR",
      reason: "Only a queued player can start the next game",
    });
    return;
  }

  const now = Date.now();

  const originalHost = server.gameState.players.find((p) => p.isHost);
  const host =
    originalHost?.queuedForNextGame ? originalHost : senderPlayer;
  if (!host) return;

  // Build the next-game roster, capped at MAX_PLAYERS. The host holds one slot;
  // queued players fill next, then ready pending spectators. Anyone past the
  // cap is KEPT as a pending spectator rather than silently dropped (the
  // reducer's PLAYER_JOINED just no-ops past the cap, which loses them).
  const queuedJoiners = server.gameState.players.filter(
    (p) => p.id !== host.id && p.queuedForNextGame
  );
  const readyPending = (server.gameState.pendingPlayers ?? []).filter(
    (p) => p.ready
  );
  const unreadyPending = (server.gameState.pendingPlayers ?? []).filter(
    (p) => !p.ready
  );

  const availableSlots = Math.max(0, MAX_PLAYERS - 1); // host holds one slot
  const admittedPlayers = queuedJoiners.slice(0, availableSlots);
  const admittedPendingReady = readyPending.slice(
    0,
    Math.max(0, availableSlots - admittedPlayers.length)
  );
  // Everyone who didn't get a seat stays on as a pending spectator (ready=false).
  const overflowPending = [
    ...queuedJoiners.slice(admittedPlayers.length),
    ...readyPending.slice(admittedPendingReady.length),
  ].map((p) => ({ id: p.id, name: p.name, joinedAt: now, ready: false }));

  const newRoom = createRoom(
    server.gameState.code,
    { id: host.id, name: host.name },
    now
  );

  let state = newRoom;
  for (const player of admittedPlayers) {
    const action: GameAction = {
      type: "PLAYER_JOINED",
      player: {
        id: player.id,
        name: player.name,
        isHost: false,
        isConnected: player.isConnected,
        joinedAt: now,
      },
    };
    state = gameReducer(state, action);
  }

  for (const pending of admittedPendingReady) {
    const action: GameAction = {
      type: "PLAYER_JOINED",
      player: {
        id: pending.id,
        name: pending.name,
        isHost: false,
        isConnected: true,
        joinedAt: now,
      },
    };
    state = gameReducer(state, action);
  }

  state = {
    ...state,
    pendingPlayers: [...unreadyPending, ...overflowPending],
  };

  state.isPremium = server.gameState.isPremium;

  if (server.seriesState && server.seriesState.currentGameNumber < server.seriesState.totalGames) {
    state.gameMode = "competitive";
    state.series = server.seriesState;
  }

  server.gameState = state;

  // Reset per-game vote tracking
  server.currentVotes.clear();
  server.gameVoteResults = [];

  // Rebuild playerStatuses from scratch
  server.playerStatuses.clear();
  for (const p of server.gameState.players) {
    server.playerStatuses.set(p.id, p.isConnected ? "idle" : "reconnecting");
  }

  clearRoundTimer(server);
  server.broadcastStateUpdate();
  server.broadcastPlayerStatuses();
}

export function handleQueueNextGame(server: RoomServer, sender: Connection) {
  if (!server.gameState) return;
  if (server.gameState.state !== "END" && server.gameState.state !== "REVEAL") return;

  const playerId = server.connectionToPlayer.get(sender.id);
  if (!playerId) return;

  const action: GameAction = { type: "PLAYER_QUEUED_NEXT", playerId };
  server.gameState = gameReducer(server.gameState, action);
  server.broadcastStateUpdate();

  // In competitive mode, check if all connected players are ready
  if (server.gameState.gameMode === "competitive" && server.seriesState) {
    const connectedPlayers = server.gameState.players.filter((p) => p.isConnected);
    const allReady = connectedPlayers.every((p) => p.queuedForNextGame);
    if (allReady && connectedPlayers.length > 0) {
      autoAdvanceAfterReady(server);
    }
  }
}

/** Called when all connected players are ready after a competitive game. */
export function autoAdvanceAfterReady(server: RoomServer) {
  if (!server.gameState || !server.seriesState) return;

  const isFinalGame =
    server.seriesState.currentGameNumber >= server.seriesState.totalGames;

  if (isFinalGame) {
    server.broadcastToAll({
      type: "SERIES_AWARDS",
      awards: server.seriesState.awards,
      finalStandings: { ...server.seriesState.cumulativePoints },
    } as ServerMessage);

    // Series is over — reset competitive state so a subsequent series starts
    // fresh (otherwise currentGameNumber would keep climbing past totalGames).
    // Clients already hold the awards/standings they were just sent.
    server.seriesState = null;
    server.currentVotes.clear();
    server.gameVoteResults = [];
  } else {
    const hostConn = [...server.connectionToPlayer.entries()]
      .find(([, pid]) => pid === server.gameState!.hostId);
    const conn = hostConn
      ? server.room.getConnection(hostConn[0])
      : undefined;
    if (conn) {
      handlePlayAgain(server, conn);
    }
    // If the host's socket is gone, host-transfer reassigns to a connected
    // player and the next ready-check advances then — no crash, no forced skip.
  }
}

export function handleCreateNextRoom(server: RoomServer, sender: Connection) {
  if (!server.gameState) return;
  if (server.gameState.state !== "END" && server.gameState.state !== "REVEAL") return;

  const playerId = server.connectionToPlayer.get(sender.id);
  if (!playerId || playerId !== server.gameState.hostId) {
    server.sendTo(sender, {
      type: "ERROR",
      reason: "Only the host can create the next room",
    });
    return;
  }

  if (server.gameState.nextRoomCode) {
    server.broadcastStateUpdate();
    return;
  }

  const nextRoomCode = generateRoomCode();
  const action: GameAction = { type: "NEXT_ROOM_CREATED", nextRoomCode };
  const newState = gameReducer(server.gameState, action);
  if (newState === server.gameState) return;

  server.gameState = newState;
  server.broadcastStateUpdate();
}

export function handleSetReady(
  server: RoomServer,
  msg: Extract<ClientMessage, { type: "SET_READY" }>,
  sender: Connection
) {
  if (!server.gameState) return;

  const playerId = server.connectionToPlayer.get(sender.id);
  if (!playerId) return;

  const isPending = server.gameState.pendingPlayers?.some(
    (p) => p.id === playerId
  );
  if (!isPending) return;

  const action: GameAction = {
    type: "PENDING_PLAYER_READY_CHANGED",
    playerId,
    ready: msg.ready,
  };
  const newState = gameReducer(server.gameState, action);
  if (newState === server.gameState) return;

  server.gameState = newState;
  server.broadcastStateUpdate();
}

export function handleNewRoom(server: RoomServer, sender: Connection) {
  if (!server.gameState) return;

  const playerId = server.connectionToPlayer.get(sender.id);
  if (!playerId || playerId !== server.gameState.hostId) {
    server.sendTo(sender, {
      type: "ERROR",
      reason: "Only the host can create a new room",
    });
    return;
  }

  const newRoomCode = generateRoomCode();

  server.broadcastToAll({ type: "ROOM_REDIRECT", newRoomCode });

  // Full room reset — drop any competitive/series state too.
  server.seriesState = null;
  server.currentVotes.clear();
  server.gameVoteResults = [];

  server.gameState = {
    ...server.gameState,
    state: "DESTROYED",
    updatedAt: Date.now(),
  };
  clearRoundTimer(server);

  setTimeout(() => {
    for (const conn of server.room.getConnections()) {
      try {
        conn.close();
      } catch {
        // ignore
      }
    }
    server.gameState = null;
  }, 1000);
}
