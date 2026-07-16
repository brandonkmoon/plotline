import type { Connection } from "partyserver";
import type { Player, GameAction, PendingPlayer } from "@/lib/game/types";
import type { ClientMessage } from "@/lib/multiplayer/types";
import { PROTOCOL_VERSION } from "@/lib/multiplayer/types";
import { gameReducer, createRoom } from "@/lib/game";
import type RoomServer from "../room";
import { verifyProducerEntitlement } from "../revenuecat";
import {
  RECONNECT_TIMEOUT_MS,
  HOST_TRANSFER_TIMEOUT_MS,
  ROOM_DESTROY_TIMEOUT_MS,
  MAX_PLAYERS,
} from "../constants";

export function handleJoinRoom(
  server: RoomServer,
  msg: Extract<ClientMessage, { type: "JOIN_ROOM" }>,
  sender: Connection
) {
  const now = Date.now();

  // Protocol version check first
  if (msg.protocolVersion !== PROTOCOL_VERSION) {
    server.sendTo(sender, {
      type: "ERROR",
      reason: "PROTOCOL_MISMATCH",
    });
    sender.close();
    return;
  }

  // Reconnection case: client supplied a playerId
  if (msg.playerId) {
    // Check pending players first
    const existingPending = server.gameState?.pendingPlayers?.find(
      (p) => p.id === msg.playerId
    );
    if (existingPending && server.gameState) {
      const existingConnId = server.playerToConnection.get(existingPending.id);
      if (existingConnId && existingConnId !== sender.id) {
        let stillConnected = false;
        for (const c of server.room.getConnections()) {
          if (c.id === existingConnId) {
            stillConnected = true;
            break;
          }
        }
        if (stillConnected) {
          server.sendTo(sender, {
            type: "ERROR",
            reason: "PLAYER_ALREADY_CONNECTED",
          });
          sender.close();
          return;
        }
      }

      server.connectionToPlayer.set(sender.id, existingPending.id);
      server.playerToConnection.set(existingPending.id, sender.id);

      if (server.roomDestroyTimer) {
        clearTimeout(server.roomDestroyTimer);
        server.roomDestroyTimer = null;
      }

      server.broadcastStateUpdate();
      return;
    }

    const existingPlayer = server.gameState?.players.find(
      (p) => p.id === msg.playerId
    );
    if (existingPlayer && server.gameState) {
      const existingConnId = server.playerToConnection.get(existingPlayer.id);
      if (existingConnId && existingConnId !== sender.id) {
        let stillConnected = false;
        for (const c of server.room.getConnections()) {
          if (c.id === existingConnId) {
            stillConnected = true;
            break;
          }
        }
        if (stillConnected) {
          server.sendTo(sender, {
            type: "ERROR",
            reason: "PLAYER_ALREADY_CONNECTED",
          });
          sender.close();
          return;
        }
      }

      // Restore connection
      server.connectionToPlayer.set(sender.id, existingPlayer.id);
      server.playerToConnection.set(existingPlayer.id, sender.id);

      // Clear disconnect timer
      const timer = server.disconnectTimers.get(existingPlayer.id);
      if (timer) {
        clearTimeout(timer);
        server.disconnectTimers.delete(existingPlayer.id);
      }

      // Cancel host transfer if reconnecting host
      if (
        server.gameState.hostId === existingPlayer.id &&
        server.hostTransferTimer
      ) {
        clearTimeout(server.hostTransferTimer);
        server.hostTransferTimer = null;
      }

      // Mark player as connected
      server.gameState = {
        ...server.gameState,
        players: server.gameState.players.map((p) =>
          p.id === existingPlayer.id ? { ...p, isConnected: true } : p
        ),
      };

      // Restore status
      const currentStatus = server.playerStatuses.get(existingPlayer.id);
      if (currentStatus !== "submitted") {
        server.playerStatuses.set(existingPlayer.id, "idle");
      }

      // Cancel room destroy timer
      if (server.roomDestroyTimer) {
        clearTimeout(server.roomDestroyTimer);
        server.roomDestroyTimer = null;
      }

      ensureHostIsConnected(server);
      server.broadcastStateUpdate();
      server.broadcastPlayerStatuses();
      server.sendRevealSnapshotTo(sender);
      return;
    }

    // playerId provided but not found
    server.sendTo(sender, {
      type: "ERROR",
      reason: "UNKNOWN_PLAYER",
    });
    sender.close();
    return;
  }

  // ── Name-based reconnection ──
  if (server.gameState && msg.playerName) {
    const disconnectedMatch = server.gameState.players.find(
      (p) => !p.isConnected && p.name === msg.playerName
    );
    if (disconnectedMatch) {
      server.connectionToPlayer.set(sender.id, disconnectedMatch.id);
      server.playerToConnection.set(disconnectedMatch.id, sender.id);

      const timer = server.disconnectTimers.get(disconnectedMatch.id);
      if (timer) {
        clearTimeout(timer);
        server.disconnectTimers.delete(disconnectedMatch.id);
      }

      if (
        server.gameState.hostId === disconnectedMatch.id &&
        server.hostTransferTimer
      ) {
        clearTimeout(server.hostTransferTimer);
        server.hostTransferTimer = null;
      }

      server.gameState = {
        ...server.gameState,
        players: server.gameState.players.map((p) =>
          p.id === disconnectedMatch.id ? { ...p, isConnected: true } : p
        ),
      };

      const currentStatus = server.playerStatuses.get(disconnectedMatch.id);
      if (currentStatus !== "submitted") {
        server.playerStatuses.set(disconnectedMatch.id, "idle");
      }

      if (server.roomDestroyTimer) {
        clearTimeout(server.roomDestroyTimer);
        server.roomDestroyTimer = null;
      }

      if (process.env.NODE_ENV === "development") {
        console.log(
          `[room] name-based reconnect: "${msg.playerName}" → ${disconnectedMatch.id}`
        );
      }

      ensureHostIsConnected(server);
      server.broadcastStateUpdate();
      server.broadcastPlayerStatuses();
      server.sendRevealSnapshotTo(sender);
      return;
    }
  }

  // ── Unique name check (case-insensitive) ──
  if (server.gameState && msg.playerName) {
    const nameLower = msg.playerName.toLowerCase();
    const nameTaken =
      server.gameState.players.some(
        (p) => p.name.toLowerCase() === nameLower
      ) ||
      (server.gameState.pendingPlayers ?? []).some(
        (p) => p.name.toLowerCase() === nameLower
      );
    if (nameTaken) {
      server.sendTo(sender, {
        type: "ERROR",
        reason: "NAME_TAKEN",
      });
      sender.close();
      return;
    }
  }

  // New player joining (no playerId)
  // If game is in progress, add them to pendingPlayers
  if (
    server.gameState &&
    server.gameState.state !== "LOBBY" &&
    server.gameState.state !== "CREATED" &&
    server.gameState.state !== "DESTROYED"
  ) {
    const pendingId = crypto.randomUUID();
    const pendingPlayer: PendingPlayer = {
      id: pendingId,
      name: msg.playerName,
      joinedAt: now,
      ready: false,
    };
    const pendingAction: GameAction = {
      type: "PENDING_PLAYER_JOINED",
      player: pendingPlayer,
    };
    const newStateAfterPending = gameReducer(server.gameState, pendingAction);
    server.gameState = newStateAfterPending;

    server.connectionToPlayer.set(sender.id, pendingId);
    server.playerToConnection.set(pendingId, sender.id);

    if (server.roomDestroyTimer) {
      clearTimeout(server.roomDestroyTimer);
      server.roomDestroyTimer = null;
    }

    server.broadcastStateUpdate();
    return;
  }

  const playerId = crypto.randomUUID();

  if (!server.gameState) {
    // First player creates the room.
    // Only honor previousHostName while the room is being created — never on
    // an already-established room, otherwise a late joiner claiming the
    // previous host's name could seize host mid-session.
    if (msg.previousHostName && server.preferredHostName === null) {
      server.preferredHostName = msg.previousHostName;
    }

    // First player creates the room
    server.gameState = createRoom(server.room.id, { id: playerId, name: msg.playerName }, now);

    // Premium (competitive mode) is NEVER trusted from the client. The room
    // starts classic; if the host supplied a RevenueCat user id, verify the
    // entitlement server-side and enable premium once RevenueCat confirms it,
    // then re-broadcast the updated lobby. Fire-and-forget: the host's socket
    // stays open in the lobby, so the async check completes before eviction.
    server.gameState.isPremium = false;
    if (msg.revenueCatUserId) {
      const appUserId = msg.revenueCatUserId;
      void verifyProducerEntitlement(server.room.env, appUserId).then(
        (entitled) => {
        if (entitled && server.gameState && !server.gameState.isPremium) {
          server.gameState.isPremium = true;
          server.saveState();
          server.broadcastStateUpdate();
        }
      });
    }
  } else {
    // isPremium gates competitive mode only — player cap is universal.
    if (server.gameState.players.length >= MAX_PLAYERS) {
      server.sendTo(sender, {
        type: "ERROR",
        reason: "ROOM_FULL",
      });
      sender.close();
      return;
    }

    // Subsequent players join
    const player: Player = {
      id: playerId,
      name: msg.playerName,
      isHost: false,
      isConnected: true,
      joinedAt: now,
    };

    const action: GameAction = { type: "PLAYER_JOINED", player };
    const newState = gameReducer(server.gameState, action);

    if (newState === server.gameState) {
      server.sendTo(sender, {
        type: "ERROR",
        reason: "Room is full",
      });
      sender.close();
      return;
    }

    server.gameState = newState;
  }

  // Map connection to player
  server.connectionToPlayer.set(sender.id, playerId);
  server.playerToConnection.set(playerId, sender.id);

  // If the previous game's host just joined, transfer host to them
  if (
    server.preferredHostName &&
    msg.playerName.toLowerCase() === server.preferredHostName.toLowerCase() &&
    server.gameState.hostId !== playerId
  ) {
    server.gameState = {
      ...server.gameState,
      hostId: playerId,
      players: server.gameState.players.map((p) => ({
        ...p,
        isHost: p.id === playerId,
      })),
      updatedAt: Date.now(),
    };
    server.preferredHostName = null; // consumed
  }

  // Set initial status
  server.playerStatuses.set(playerId, "idle");

  // Cancel room destroy timer
  if (server.roomDestroyTimer) {
    clearTimeout(server.roomDestroyTimer);
    server.roomDestroyTimer = null;
  }

  ensureHostIsConnected(server);
  server.broadcastStateUpdate();
  server.broadcastPlayerStatuses();
}

export function handlePlayerDisconnected(server: RoomServer, playerId: string) {
  server.disconnectTimers.delete(playerId);
  server.playerStatuses.set(playerId, "disconnected");

  if (server.gameState) {
    server.gameState = {
      ...server.gameState,
      players: server.gameState.players.map((p) =>
        p.id === playerId ? { ...p, isConnected: false } : p
      ),
    };
  }

  server.broadcastStateUpdate();
  server.broadcastPlayerStatuses();
  checkForEmptyRoom(server);
}

export function transferHost(server: RoomServer, oldHostId: string) {
  if (!server.gameState) return;
  server.hostTransferTimer = null;

  const connectedPlayers = server.gameState.players
    .filter((p) => p.isConnected && p.id !== oldHostId)
    .sort((a, b) => a.joinedAt - b.joinedAt);

  if (connectedPlayers.length === 0) return;

  const newHost = connectedPlayers[0];
  server.gameState = {
    ...server.gameState,
    hostId: newHost.id,
    players: server.gameState.players.map((p) => ({
      ...p,
      isHost: p.id === newHost.id,
    })),
    updatedAt: Date.now(),
  };

  server.broadcastStateUpdate();
}

export function ensureHostIsConnected(server: RoomServer) {
  if (!server.gameState) return;

  const host = server.gameState.players.find(
    (p) => p.id === server.gameState!.hostId
  );
  if (host?.isConnected) return;

  if (server.hostTransferTimer) {
    clearTimeout(server.hostTransferTimer);
    server.hostTransferTimer = null;
  }

  const connectedPlayers = server.gameState.players
    .filter((p) => p.isConnected && p.id !== server.gameState!.hostId)
    .sort((a, b) => a.joinedAt - b.joinedAt);

  if (connectedPlayers.length === 0) return;

  const newHost = connectedPlayers[0];
  server.gameState = {
    ...server.gameState,
    hostId: newHost.id,
    players: server.gameState.players.map((p) => ({
      ...p,
      isHost: p.id === newHost.id,
    })),
    updatedAt: Date.now(),
  };

  server.broadcastStateUpdate();
}

export function checkForEmptyRoom(server: RoomServer) {
  if (!server.gameState) return;

  const connectedCount = server.gameState.players.filter(
    (p) => p.isConnected
  ).length;
  const reconnectingCount = Array.from(server.playerStatuses.values()).filter(
    (s) => s === "reconnecting"
  ).length;

  if (connectedCount === 0 && reconnectingCount === 0) {
    if (!server.roomDestroyTimer) {
      server.roomDestroyTimer = setTimeout(() => {
        server.gameState = null;
        server.clearRoundTimer();
        // Room is gone — clear competitive/series state so a brand-new room
        // reusing this server instance can't inherit stale data.
        server.seriesState = null;
        server.currentVotes.clear();
        server.gameVoteResults = [];
      }, ROOM_DESTROY_TIMEOUT_MS);
    }
  }
}
