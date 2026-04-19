import type * as Party from "partykit/server";
import type { Room, Player, GameAction, PendingPlayer } from "@/lib/game/types";
import type {
  ClientMessage,
  ServerMessage,
  PlayerStatus,
} from "@/lib/multiplayer/types";
import { PROTOCOL_VERSION } from "@/lib/multiplayer/types";
import { gameReducer, createRoom, assembleStories, generateRoomCode } from "@/lib/game";
import { serializeRoomForArchive } from "@/lib/archive/serialize";

/**
 * STATE_UPDATE message shape (protocol v2):
 *   type: "STATE_UPDATE"
 *   room:                the full Room snapshot
 *   playerId:            the id of the recipient (per-connection)
 *   roundStartedAt:      epoch ms when current PLAYING round started, or null
 *   roundDurationMs:     total duration of each round in ms (default 90000)
 *   pendingConnected:    count of current-round slots that are unsubmitted
 *                        and whose assigned player is currently connected
 *   pendingDisconnected: count of current-round slots that are unsubmitted
 *                        and whose assigned player is currently offline
 *   protocolVersion:     the server's wire-protocol version (2). If the
 *                        client's JOIN_ROOM protocolVersion differs, the
 *                        server responds with ERROR reason="PROTOCOL_MISMATCH"
 *                        and closes the connection.
 */

const ROUND_TIMER_MS = 90_000;
const RECONNECT_TIMEOUT_MS = 120_000; // 2 minutes
const HOST_TRANSFER_TIMEOUT_MS = 30_000; // 30 seconds
const ROOM_DESTROY_TIMEOUT_MS = 600_000; // 10 minutes

export default class RoomServer implements Party.Server {
  room: Party.Room;

  // Game state
  gameState: Room | null = null;

  // Connection tracking: connectionId -> playerId
  connectionToPlayer: Map<string, string> = new Map();
  // playerId -> connectionId
  playerToConnection: Map<string, string> = new Map();

  // Player statuses
  playerStatuses: Map<string, PlayerStatus> = new Map();

  // Timers
  roundTimer: ReturnType<typeof setTimeout> | null = null;
  disconnectTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  hostTransferTimer: ReturnType<typeof setTimeout> | null = null;
  roomDestroyTimer: ReturnType<typeof setTimeout> | null = null;
  roundStartTime: number | null = null;
  roundStartedAt: number | null = null;

  // Reveal state tracking
  revealStoryIndex: number = 0;
  revealedLineCount: number = 0;

  constructor(room: Party.Room) {
    this.room = room;
  }

  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    // If the client passed a playerId in the URL query string and it
    // matches an existing player, re-register the connection mapping
    // immediately. This covers the case where PartySocket opens a new
    // socket (e.g., after a reconnect) before the JOIN_ROOM message
    // is sent — without this, onClose of the old socket would delete
    // the player-side map, losing state.
    try {
      const url = new URL(ctx.request.url);
      const playerId = url.searchParams.get("playerId");
      if (playerId && this.gameState) {
        const existingPlayer = this.gameState.players.find(
          (p) => p.id === playerId
        );
        const existingPending = this.gameState.pendingPlayers?.find(
          (p) => p.id === playerId
        );
        if (existingPlayer || existingPending) {
          this.connectionToPlayer.set(conn.id, playerId);
          this.playerToConnection.set(playerId, conn.id);
          if (process.env.NODE_ENV === "development") {
            console.log(
              "[room] reconnect registered:",
              playerId,
              "→",
              conn.id
            );
          }
        }
      }
    } catch {
      // ignore malformed URLs
    }
  }

  onMessage(message: string, sender: Party.Connection) {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(message);
    } catch {
      this.sendTo(sender, {
        type: "ERROR",
        reason: "Invalid message format",
      });
      return;
    }

    if (process.env.NODE_ENV === "development") {
      const playerId = this.connectionToPlayer.get(sender.id) ?? "(none)";
      console.log(
        `[room] ← ${msg.type} from conn=${sender.id} player=${playerId}`
      );
    }

    switch (msg.type) {
      case "JOIN_ROOM":
        this.handleJoinRoom(msg, sender);
        break;
      case "START_GAME":
        this.handleStartGame(sender);
        break;
      case "SUBMIT_PROMPT":
        this.handleSubmitPrompt(msg, sender);
        break;
      case "HOST_ADVANCE":
        this.handleHostAdvance(sender);
        break;
      case "ADVANCE_REVEAL":
        this.handleAdvanceReveal(sender);
        break;
      case "REVEAL_ADVANCE":
        this.handleRevealAdvance(sender);
        break;
      case "END_GAME":
        this.handleEndGame(sender);
        break;
      case "PLAY_AGAIN":
        this.handlePlayAgain(sender);
        break;
      case "QUEUE_NEXT_GAME":
        this.handleQueueNextGame(sender);
        break;
      case "NEW_ROOM":
        this.handleNewRoom(sender);
        break;
      case "SET_READY":
        this.handleSetReady(msg, sender);
        break;
      case "TYPING_STATUS":
        this.handleTypingStatus(msg, sender);
        break;
      default:
        this.sendTo(sender, {
          type: "ERROR",
          reason: "Unknown message type",
        });
    }
  }

  onClose(conn: Party.Connection) {
    const playerId = this.connectionToPlayer.get(conn.id);
    if (!playerId) return;

    // Always clean up the connection-side map — this specific
    // connection is gone.
    this.connectionToPlayer.delete(conn.id);

    // Only clear the player-side map if it still points to THIS
    // closing connection. If the player already reconnected on a
    // newer connection, playerToConnection now points to the newer
    // id and we must not delete it — otherwise the next JOIN_ROOM
    // would see an empty map and lose state.
    const storedConnId = this.playerToConnection.get(playerId);
    if (storedConnId === conn.id) {
      this.playerToConnection.delete(playerId);
    } else {
      // A newer connection already claimed this player — nothing
      // to clean up on the player-side, and no need to mark them
      // as reconnecting.
      return;
    }

    // If the disconnecting identity is a pending player, remove them
    // from pendingPlayers immediately — they don't participate in
    // reconnect timeouts.
    if (
      this.gameState?.pendingPlayers?.some((p) => p.id === playerId)
    ) {
      const action: GameAction = {
        type: "PENDING_PLAYER_LEFT",
        playerId,
      };
      const newState = gameReducer(this.gameState, action);
      if (newState !== this.gameState) {
        this.gameState = newState;
        this.broadcastStateUpdate();
      }
      this.checkForEmptyRoom();
      return;
    }

    // Mark player as reconnecting — but preserve "submitted" status so
    // they don't see the prompt screen again if they already submitted.
    const currentStatus = this.playerStatuses.get(playerId);
    if (currentStatus !== "submitted") {
      this.playerStatuses.set(playerId, "reconnecting");
    }
    this.broadcastPlayerStatuses();

    // Set reconnect timeout
    const disconnectTimer = setTimeout(() => {
      this.handlePlayerDisconnected(playerId);
    }, RECONNECT_TIMEOUT_MS);
    this.disconnectTimers.set(playerId, disconnectTimer);

    // If this was the host, start host transfer timer
    if (this.gameState && this.gameState.hostId === playerId) {
      this.hostTransferTimer = setTimeout(() => {
        this.transferHost(playerId);
      }, HOST_TRANSFER_TIMEOUT_MS);
    }

    // Check if any connected players remain
    this.checkForEmptyRoom();
  }

  // --- Message Handlers ---

  private handleJoinRoom(
    msg: Extract<ClientMessage, { type: "JOIN_ROOM" }>,
    sender: Party.Connection
  ) {
    const now = Date.now();

    // Protocol version check first
    if (msg.protocolVersion !== PROTOCOL_VERSION) {
      this.sendTo(sender, {
        type: "ERROR",
        reason: "PROTOCOL_MISMATCH",
      });
      sender.close();
      return;
    }

    // Reconnection case: client supplied a playerId
    if (msg.playerId) {
      // Check pending players first — a pending joiner reconnecting should
      // restore their pending status, not get UNKNOWN_PLAYER
      const existingPending = this.gameState?.pendingPlayers?.find(
        (p) => p.id === msg.playerId
      );
      if (existingPending && this.gameState) {
        const existingConnId = this.playerToConnection.get(existingPending.id);
        if (existingConnId && existingConnId !== sender.id) {
          let stillConnected = false;
          for (const c of this.room.getConnections()) {
            if (c.id === existingConnId) {
              stillConnected = true;
              break;
            }
          }
          if (stillConnected) {
            this.sendTo(sender, {
              type: "ERROR",
              reason: "PLAYER_ALREADY_CONNECTED",
            });
            sender.close();
            return;
          }
        }

        this.connectionToPlayer.set(sender.id, existingPending.id);
        this.playerToConnection.set(existingPending.id, sender.id);

        if (this.roomDestroyTimer) {
          clearTimeout(this.roomDestroyTimer);
          this.roomDestroyTimer = null;
        }

        this.broadcastStateUpdate();
        return;
      }

      const existingPlayer = this.gameState?.players.find(
        (p) => p.id === msg.playerId
      );
      if (existingPlayer && this.gameState) {
        // Safeguard: if this player is already connected from another
        // active socket, reject the new connection rather than silently
        // attaching it. Prevents two tabs in the same browser from
        // hijacking each other's identity.
        const existingConnId = this.playerToConnection.get(existingPlayer.id);
        if (existingConnId && existingConnId !== sender.id) {
          // Verify the existing connection is still alive — if its
          // socket was already closed, the maps may be stale.
          let stillConnected = false;
          for (const c of this.room.getConnections()) {
            if (c.id === existingConnId) {
              stillConnected = true;
              break;
            }
          }
          if (stillConnected) {
            this.sendTo(sender, {
              type: "ERROR",
              reason: "PLAYER_ALREADY_CONNECTED",
            });
            sender.close();
            return;
          }
        }

        // Restore connection
        this.connectionToPlayer.set(sender.id, existingPlayer.id);
        this.playerToConnection.set(existingPlayer.id, sender.id);

        // Clear disconnect timer
        const timer = this.disconnectTimers.get(existingPlayer.id);
        if (timer) {
          clearTimeout(timer);
          this.disconnectTimers.delete(existingPlayer.id);
        }

        // Cancel host transfer if reconnecting host
        if (
          this.gameState.hostId === existingPlayer.id &&
          this.hostTransferTimer
        ) {
          clearTimeout(this.hostTransferTimer);
          this.hostTransferTimer = null;
        }

        // Mark player as connected
        this.gameState = {
          ...this.gameState,
          players: this.gameState.players.map((p) =>
            p.id === existingPlayer.id ? { ...p, isConnected: true } : p
          ),
        };

        // Restore status — if they already submitted the current round,
        // keep them as "submitted". Otherwise, idle.
        const currentStatus = this.playerStatuses.get(existingPlayer.id);
        if (currentStatus !== "submitted") {
          this.playerStatuses.set(existingPlayer.id, "idle");
        }

        // Cancel room destroy timer if we have players again
        if (this.roomDestroyTimer) {
          clearTimeout(this.roomDestroyTimer);
          this.roomDestroyTimer = null;
        }

        this.broadcastStateUpdate();
        this.broadcastPlayerStatuses();
        return;
      }

      // playerId provided but not found
      this.sendTo(sender, {
        type: "ERROR",
        reason: "UNKNOWN_PLAYER",
      });
      sender.close();
      return;
    }

    // ── Name-based reconnection ──
    // No playerId was supplied, but if there's a disconnected player with
    // the exact same name, treat this as a reconnect. This covers the
    // common case where a player closes their tab, re-enters via /join
    // with the same name, and the client-side identity was cleared.
    if (this.gameState && msg.playerName) {
      const disconnectedMatch = this.gameState.players.find(
        (p) => !p.isConnected && p.name === msg.playerName
      );
      if (disconnectedMatch) {
        // Re-use the existing player slot (same logic as id-based reconnect)
        this.connectionToPlayer.set(sender.id, disconnectedMatch.id);
        this.playerToConnection.set(disconnectedMatch.id, sender.id);

        // Clear disconnect timer
        const timer = this.disconnectTimers.get(disconnectedMatch.id);
        if (timer) {
          clearTimeout(timer);
          this.disconnectTimers.delete(disconnectedMatch.id);
        }

        // Cancel host transfer if reconnecting host
        if (
          this.gameState.hostId === disconnectedMatch.id &&
          this.hostTransferTimer
        ) {
          clearTimeout(this.hostTransferTimer);
          this.hostTransferTimer = null;
        }

        // Mark player as connected
        this.gameState = {
          ...this.gameState,
          players: this.gameState.players.map((p) =>
            p.id === disconnectedMatch.id ? { ...p, isConnected: true } : p
          ),
        };

        // Restore status
        const currentStatus = this.playerStatuses.get(disconnectedMatch.id);
        if (currentStatus !== "submitted") {
          this.playerStatuses.set(disconnectedMatch.id, "idle");
        }

        // Cancel room destroy timer
        if (this.roomDestroyTimer) {
          clearTimeout(this.roomDestroyTimer);
          this.roomDestroyTimer = null;
        }

        if (process.env.NODE_ENV === "development") {
          console.log(
            `[room] name-based reconnect: "${msg.playerName}" → ${disconnectedMatch.id}`
          );
        }

        this.broadcastStateUpdate();
        this.broadcastPlayerStatuses();
        return;
      }
    }

    // ── Unique name check (case-insensitive) ──
    // Reject if any active player or pending player already has this name.
    if (this.gameState && msg.playerName) {
      const nameLower = msg.playerName.toLowerCase();
      const nameTaken =
        this.gameState.players.some(
          (p) => p.name.toLowerCase() === nameLower
        ) ||
        (this.gameState.pendingPlayers ?? []).some(
          (p) => p.name.toLowerCase() === nameLower
        );
      if (nameTaken) {
        this.sendTo(sender, {
          type: "ERROR",
          reason: "NAME_TAKEN",
        });
        sender.close();
        return;
      }
    }

    // New player joining (no playerId)
    // If game is in progress, add them to pendingPlayers instead of
    // rejecting. They'll auto-join when the next game starts.
    if (
      this.gameState &&
      this.gameState.state !== "LOBBY" &&
      this.gameState.state !== "CREATED" &&
      this.gameState.state !== "DESTROYED"
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
      const newStateAfterPending = gameReducer(this.gameState, pendingAction);
      this.gameState = newStateAfterPending;

      this.connectionToPlayer.set(sender.id, pendingId);
      this.playerToConnection.set(pendingId, sender.id);

      if (this.roomDestroyTimer) {
        clearTimeout(this.roomDestroyTimer);
        this.roomDestroyTimer = null;
      }

      this.broadcastStateUpdate();
      return;
    }

    const playerId = crypto.randomUUID();

    if (!this.gameState) {
      // First player creates the room
      this.gameState = createRoom(this.room.id, { id: playerId, name: msg.playerName }, now);
    } else {
      // Subsequent players join
      const player: Player = {
        id: playerId,
        name: msg.playerName,
        isHost: false,
        isConnected: true,
        joinedAt: now,
      };

      const action: GameAction = { type: "PLAYER_JOINED", player };
      const newState = gameReducer(this.gameState, action);

      // Check if player was actually added (reducer might reject, e.g. full room)
      if (newState === this.gameState) {
        this.sendTo(sender, {
          type: "ERROR",
          reason: "Room is full",
        });
        sender.close();
        return;
      }

      this.gameState = newState;
    }

    // Map connection to player
    this.connectionToPlayer.set(sender.id, playerId);
    this.playerToConnection.set(playerId, sender.id);

    // Set initial status
    this.playerStatuses.set(playerId, "idle");

    // Cancel room destroy timer
    if (this.roomDestroyTimer) {
      clearTimeout(this.roomDestroyTimer);
      this.roomDestroyTimer = null;
    }

    this.broadcastStateUpdate();
    this.broadcastPlayerStatuses();
  }

  private handleStartGame(sender: Party.Connection) {
    if (!this.gameState) return;

    const playerId = this.connectionToPlayer.get(sender.id);
    if (!playerId || playerId !== this.gameState.hostId) {
      this.sendTo(sender, {
        type: "ERROR",
        reason: "Only the host can start the game",
      });
      return;
    }

    const now = Date.now();
    const action: GameAction = {
      type: "GAME_STARTED",
      hostId: playerId,
      timestamp: now,
    };
    const newState = gameReducer(this.gameState, action);

    if (newState === this.gameState) {
      this.sendTo(sender, {
        type: "ERROR",
        reason: "Cannot start game (need at least 4 players)",
      });
      return;
    }

    this.gameState = newState;

    // Reset all player statuses to idle
    for (const p of this.gameState.players) {
      if (this.playerStatuses.get(p.id) !== "disconnected" && this.playerStatuses.get(p.id) !== "reconnecting") {
        this.playerStatuses.set(p.id, "idle");
      }
    }

    this.startRoundTimer();
    this.broadcastStateUpdate();
    this.broadcastPlayerStatuses();
  }

  private handleSubmitPrompt(
    msg: Extract<ClientMessage, { type: "SUBMIT_PROMPT" }>,
    sender: Party.Connection
  ) {
    if (!this.gameState) return;

    const playerId = this.connectionToPlayer.get(sender.id);
    if (!playerId) return;

    const action: GameAction = {
      type: "PROMPT_SUBMITTED",
      playerId,
      storyIndex: msg.storyIndex,
      promptIndex: msg.promptIndex,
      response: msg.response,
    };

    const prevRound = this.gameState.currentRound;
    const newState = gameReducer(this.gameState, action);
    if (newState === this.gameState) {
      this.sendTo(sender, {
        type: "ERROR",
        reason: "Invalid submission",
      });
      return;
    }

    this.gameState = newState;

    // Update player status to submitted
    this.playerStatuses.set(playerId, "submitted");

    // Check if game moved to REVEAL
    if (newState.state === "REVEAL") {
      this.clearRoundTimer();
      this.initRevealState();
      const stories = assembleStories(newState);
      this.broadcast({ type: "ASSEMBLED_STORIES", stories });
      this.broadcastRevealState();
    } else if (newState.currentRound > prevRound && newState.state === "PLAYING") {
      // Round auto-advanced (all slots filled), restart timer and reset statuses
      this.resetPlayerStatusesForNewRound();
      this.startRoundTimer();
    } else if (newState.state === "PLAYING" && newState.currentRound === prevRound) {
      // Round didn't auto-advance — check if the only remaining nulls belong
      // to disconnected players. If so, signal the host immediately rather
      // than making everyone wait 90 seconds for the timer.
      const currentRound = newState.currentRound;
      const allConnectedSubmitted = newState.stories.every((s) => {
        const slot = s.slots[currentRound];
        if (!slot || slot.response !== null) return true;
        const player = newState.players.find((p) => p.id === slot.playerId);
        return !player?.isConnected; // disconnected players don't block
      });
      if (allConnectedSubmitted) {
        const unsubmittedCount = newState.stories.filter(
          (s) => s.slots[currentRound]?.response === null
        ).length;
        this.broadcast({ type: "ADVANCE_AVAILABLE", unsubmittedCount });
      }
    }

    this.broadcastStateUpdate();
    this.broadcastPlayerStatuses();
  }

  private handleHostAdvance(sender: Party.Connection) {
    if (!this.gameState) return;

    const playerId = this.connectionToPlayer.get(sender.id);
    if (!playerId || playerId !== this.gameState.hostId) {
      this.sendTo(sender, {
        type: "ERROR",
        reason: "Only the host can advance",
      });
      return;
    }

    const now = Date.now();
    const prevState = this.gameState;
    const action: GameAction = {
      type: "HOST_ADVANCED",
      hostId: playerId,
      timestamp: now,
    };
    const newState = gameReducer(this.gameState, action);
    this.gameState = newState;

    if (newState.state === "REVEAL") {
      this.clearRoundTimer();
      this.initRevealState();
      const stories = assembleStories(newState);
      this.broadcast({ type: "ASSEMBLED_STORIES", stories });
      this.broadcastRevealState();
    } else if (newState.currentRound > prevState.currentRound) {
      this.resetPlayerStatusesForNewRound();
      this.startRoundTimer();
    }

    this.broadcastStateUpdate();
    this.broadcastPlayerStatuses();
  }

  private handleAdvanceReveal(sender: Party.Connection) {
    if (!this.gameState) return;
    if (this.gameState.state !== "REVEAL") return;

    // Mark the current story as revealed (if not already) and move on.
    const currentStory = this.gameState.stories[this.revealStoryIndex];
    const targetStoryIndex =
      currentStory && !currentStory.isRevealed
        ? currentStory.index
        : this.gameState.stories.find((s) => !s.isRevealed)?.index;

    if (targetStoryIndex === undefined) return;

    const now = Date.now();
    const action: GameAction = {
      type: "STORY_REVEALED",
      storyIndex: targetStoryIndex,
      timestamp: now,
    };
    this.gameState = gameReducer(this.gameState, action);

    // If there are more stories, advance to next and reset reveal state
    const nextUnrevealed = this.gameState.stories.find((s) => !s.isRevealed);
    if (nextUnrevealed) {
      this.revealStoryIndex = nextUnrevealed.index;
      this.revealedLineCount = 0;
      this.broadcastRevealState();
    }

    this.broadcastStateUpdate();

    // Archive when game transitions to END (all stories revealed)
    if (this.gameState.state === "END") {
      this.archiveRoom();
    }
  }

  private handleRevealAdvance(sender: Party.Connection) {
    if (!this.gameState) return;
    if (this.gameState.state !== "REVEAL") return;

    const playerId = this.connectionToPlayer.get(sender.id);
    if (!playerId) return;

    // Verify the sender is the designated reader for the current story
    const currentStory = this.gameState.stories[this.revealStoryIndex];
    if (!currentStory) return;

    const readerSlot = currentStory.slots.find(s => s.promptIndex === 6);
    const readerId = readerSlot?.playerId;

    if (playerId !== readerId) {
      // If the designated reader is offline, fall back to the host so the
      // reveal doesn't get permanently stuck.
      const reader = this.gameState.players.find(p => p.id === readerId);
      const readerIsOffline = !reader?.isConnected;
      const senderIsHost = playerId === this.gameState.hostId;
      if (!readerIsOffline || !senderIsHost) {
        this.sendTo(sender, {
          type: "ERROR",
          reason: "Only the reader can advance the reveal",
        });
        return;
      }
    }

    // Idempotent: don't increment past 7. The reader sees all 7 lines
    // but nothing auto-advances. Only ADVANCE_REVEAL moves to the
    // next story.
    if (this.revealedLineCount >= 7) {
      return;
    }

    this.revealedLineCount++;

    this.broadcastRevealState();
    this.broadcastStateUpdate();
  }

  private handleEndGame(sender: Party.Connection) {
    if (!this.gameState) return;

    const now = Date.now();
    const action: GameAction = { type: "GAME_ENDED", timestamp: now };
    this.gameState = gameReducer(this.gameState, action);

    this.clearRoundTimer();
    this.broadcastStateUpdate();

    // Archive when game ends
    if (this.gameState.state === "END") {
      this.archiveRoom();
    }
  }

  private handlePlayAgain(sender: Party.Connection) {
    if (!this.gameState) return;
    if (this.gameState.state !== "END" && this.gameState.state !== "REVEAL")
      return;

    const senderPlayerId = this.connectionToPlayer.get(sender.id);
    if (!senderPlayerId || senderPlayerId !== this.gameState.hostId) {
      this.sendTo(sender, {
        type: "ERROR",
        reason: "Only the host can start the next round",
      });
      return;
    }

    const now = Date.now();
    const host = this.gameState.players.find((p) => p.isHost);
    if (!host) return;

    const readyPending = (this.gameState.pendingPlayers ?? []).filter(
      (p) => p.ready
    );
    const keepPending = (this.gameState.pendingPlayers ?? []).filter(
      (p) => !p.ready
    );

    // Create fresh room with same code and players
    const newRoom = createRoom(
      this.gameState.code,
      { id: host.id, name: host.name },
      now
    );

    // Re-add only players who have queued for the next game
    let state = newRoom;
    for (const player of this.gameState.players) {
      if (player.id === host.id) continue;
      if (!player.isConnected) continue;
      if (!player.queuedForNextGame) continue;

      const action: GameAction = {
        type: "PLAYER_JOINED",
        player: {
          id: player.id,
          name: player.name,
          isHost: false,
          isConnected: true,
          joinedAt: now,
        },
      };
      state = gameReducer(state, action);
    }

    // Promote ready pending players to active players
    for (const pending of readyPending) {
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

    // Preserve non-ready pending players across the reset
    state = {
      ...state,
      pendingPlayers: keepPending,
    };

    this.gameState = state;

    // Reset statuses
    for (const p of this.gameState.players) {
      this.playerStatuses.set(p.id, "idle");
    }

    this.clearRoundTimer();
    this.broadcastStateUpdate();
    this.broadcastPlayerStatuses();
  }

  private handleQueueNextGame(sender: Party.Connection) {
    if (!this.gameState) return;
    if (this.gameState.state !== "END") return;

    const playerId = this.connectionToPlayer.get(sender.id);
    if (!playerId) return;

    const action: GameAction = { type: "PLAYER_QUEUED_NEXT", playerId };
    this.gameState = gameReducer(this.gameState, action);
    this.broadcastStateUpdate();
  }

  private handleSetReady(
    msg: Extract<ClientMessage, { type: "SET_READY" }>,
    sender: Party.Connection
  ) {
    if (!this.gameState) return;

    const playerId = this.connectionToPlayer.get(sender.id);
    if (!playerId) return;

    const isPending = this.gameState.pendingPlayers?.some(
      (p) => p.id === playerId
    );
    if (!isPending) return;

    const action: GameAction = {
      type: "PENDING_PLAYER_READY_CHANGED",
      playerId,
      ready: msg.ready,
    };
    const newState = gameReducer(this.gameState, action);
    if (newState === this.gameState) return;

    this.gameState = newState;
    this.broadcastStateUpdate();
  }

  private handleNewRoom(sender: Party.Connection) {
    if (!this.gameState) return;

    const playerId = this.connectionToPlayer.get(sender.id);
    if (!playerId || playerId !== this.gameState.hostId) {
      this.sendTo(sender, {
        type: "ERROR",
        reason: "Only the host can create a new room",
      });
      return;
    }

    const newRoomCode = generateRoomCode();

    // Broadcast ROOM_REDIRECT to all connected clients
    this.broadcast({ type: "ROOM_REDIRECT", newRoomCode });

    // Mark current room as destroyed and close connections after a short
    // delay to let the redirect message reach clients.
    this.gameState = {
      ...this.gameState,
      state: "DESTROYED",
      updatedAt: Date.now(),
    };
    this.clearRoundTimer();

    setTimeout(() => {
      for (const conn of this.room.getConnections()) {
        try {
          conn.close();
        } catch {
          // ignore
        }
      }
      this.gameState = null;
    }, 1000);
  }

  private handleTypingStatus(
    msg: Extract<ClientMessage, { type: "TYPING_STATUS" }>,
    sender: Party.Connection
  ) {
    const playerId = this.connectionToPlayer.get(sender.id);
    if (!playerId) return;

    // Only update if player hasn't already submitted
    const currentStatus = this.playerStatuses.get(playerId);
    if (currentStatus === "submitted") return;

    this.playerStatuses.set(playerId, msg.status);
    this.broadcastPlayerStatuses();
  }

  // --- Timers ---

  private startRoundTimer() {
    this.clearRoundTimer();
    this.roundStartTime = Date.now();
    this.roundStartedAt = Date.now();

    this.roundTimer = setTimeout(() => {
      if (!this.gameState || this.gameState.state !== "PLAYING") return;

      // Count unsubmitted players for current round
      const currentRound = this.gameState.currentRound;
      const unsubmittedCount = this.gameState.stories.filter(
        (s) => s.slots[currentRound]?.response === null
      ).length;

      this.broadcast({
        type: "ADVANCE_AVAILABLE",
        unsubmittedCount,
      });
    }, ROUND_TIMER_MS);
  }

  private clearRoundTimer() {
    if (this.roundTimer) {
      clearTimeout(this.roundTimer);
      this.roundTimer = null;
    }
    this.roundStartTime = null;
    this.roundStartedAt = null;
  }

  private resetPlayerStatusesForNewRound() {
    if (!this.gameState) return;
    for (const p of this.gameState.players) {
      const current = this.playerStatuses.get(p.id);
      if (current !== "disconnected" && current !== "reconnecting") {
        this.playerStatuses.set(p.id, "idle");
      }
    }
  }

  // --- Disconnect handling ---

  private handlePlayerDisconnected(playerId: string) {
    this.disconnectTimers.delete(playerId);
    this.playerStatuses.set(playerId, "disconnected");

    if (this.gameState) {
      // Mark player as disconnected in game state
      this.gameState = {
        ...this.gameState,
        players: this.gameState.players.map((p) =>
          p.id === playerId ? { ...p, isConnected: false } : p
        ),
      };
    }

    this.broadcastStateUpdate();
    this.broadcastPlayerStatuses();
    this.checkForEmptyRoom();
  }

  private transferHost(oldHostId: string) {
    if (!this.gameState) return;
    this.hostTransferTimer = null;

    // Find earliest-joined connected player
    const connectedPlayers = this.gameState.players
      .filter((p) => p.isConnected && p.id !== oldHostId)
      .sort((a, b) => a.joinedAt - b.joinedAt);

    if (connectedPlayers.length === 0) return;

    const newHost = connectedPlayers[0];
    this.gameState = {
      ...this.gameState,
      hostId: newHost.id,
      players: this.gameState.players.map((p) => ({
        ...p,
        isHost: p.id === newHost.id,
      })),
      updatedAt: Date.now(),
    };

    this.broadcastStateUpdate();
  }

  private checkForEmptyRoom() {
    if (!this.gameState) return;

    const connectedCount = this.gameState.players.filter(
      (p) => p.isConnected
    ).length;
    const reconnectingCount = Array.from(this.playerStatuses.values()).filter(
      (s) => s === "reconnecting"
    ).length;

    if (connectedCount === 0 && reconnectingCount === 0) {
      // No one connected or reconnecting, start destroy timer
      if (!this.roomDestroyTimer) {
        this.roomDestroyTimer = setTimeout(() => {
          this.gameState = null;
          this.clearRoundTimer();
        }, ROOM_DESTROY_TIMEOUT_MS);
      }
    }
  }

  // --- Archiving ---

  private async archiveRoom() {
    if (!this.gameState) return;
    try {
      const archiveData = serializeRoomForArchive(this.gameState);
      const apiHost = process.env.APP_URL || "http://localhost:3000";
      const response = await fetch(`${apiHost}/api/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(archiveData),
      });
      if (response.ok) {
        const { archiveUrl } = await response.json();
        this.broadcast({ type: "ARCHIVE_READY", archiveUrl });
      } else {
        console.error("Archive API returned", response.status);
      }
    } catch (error) {
      console.error("Failed to archive room:", error);
      // Don't block the game — just log
    }
  }

  // --- Broadcasting ---

  private sendTo(conn: Party.Connection, msg: ServerMessage) {
    conn.send(JSON.stringify(msg));
  }

  private broadcast(msg: ServerMessage) {
    const data = JSON.stringify(msg);
    let count = 0;
    for (const conn of this.room.getConnections()) {
      conn.send(data);
      count++;
    }
    if (process.env.NODE_ENV === "development") {
      console.log(`[room] → broadcast ${msg.type} to ${count} client(s)`);
    }
  }

  private initRevealState() {
    this.revealStoryIndex = 0;
    this.revealedLineCount = 0;
  }

  private broadcastRevealState() {
    if (!this.gameState) return;
    const currentStory = this.gameState.stories[this.revealStoryIndex];
    if (!currentStory) return;

    const readerSlot = currentStory.slots.find(s => s.promptIndex === 6);
    const readerId = readerSlot?.playerId ?? "";
    const readerPlayer = readerId ? this.gameState.players.find(p => p.id === readerId) : null;
    const readerName = readerPlayer?.name ?? "someone";

    this.broadcast({
      type: "REVEAL_STATE",
      storyIndex: this.revealStoryIndex,
      revealedCount: this.revealedLineCount,
      readerId,
      readerName,
    });
  }

  private computePendingCounts(): {
    pendingConnected: number;
    pendingDisconnected: number;
  } {
    let pendingConnected = 0;
    let pendingDisconnected = 0;
    if (!this.gameState) return { pendingConnected, pendingDisconnected };
    if (this.gameState.state !== "PLAYING") {
      return { pendingConnected, pendingDisconnected };
    }
    const currentRound = this.gameState.currentRound;
    for (const story of this.gameState.stories) {
      const slot = story.slots.find((s) => s.promptIndex === currentRound);
      if (slot && slot.response === null && slot.playerId) {
        const player = this.gameState.players.find(
          (p) => p.id === slot.playerId
        );
        if (player?.isConnected) pendingConnected++;
        else pendingDisconnected++;
      }
    }
    return { pendingConnected, pendingDisconnected };
  }

  private broadcastStateUpdate() {
    if (!this.gameState) return;

    const { pendingConnected, pendingDisconnected } =
      this.computePendingCounts();

    if (process.env.NODE_ENV === "development") {
      const lastState = (this as any)._lastLoggedState;
      if (lastState !== this.gameState.state) {
        console.log(
          `[room] phase change: ${lastState ?? "(none)"} → ${this.gameState.state} (round=${this.gameState.currentRound}, players=${this.gameState.players.length})`
        );
        (this as any)._lastLoggedState = this.gameState.state;
      }
    }

    // Send STATE_UPDATE to every player via our authoritative
    // playerToConnection map. Do NOT delete stale entries here —
    // the player may reconnect momentarily. onClose handles
    // cleanup conditionally.
    let count = 0;
    for (const [playerId, connId] of this.playerToConnection) {
      const conn = this.room.getConnection(connId);
      if (!conn) {
        if (process.env.NODE_ENV === "development") {
          console.log(
            `[room] skipping player ${playerId} — conn not live`
          );
        }
        continue;
      }
      this.sendTo(conn, {
        type: "STATE_UPDATE",
        room: this.gameState,
        playerId,
        roundStartedAt: this.roundStartedAt,
        roundDurationMs: ROUND_TIMER_MS,
        pendingConnected,
        pendingDisconnected,
        protocolVersion: PROTOCOL_VERSION,
      });
      count++;
    }

    if (process.env.NODE_ENV === "development") {
      console.log(
        `[room] → STATE_UPDATE to ${count} client(s) | pendingConn=${pendingConnected} pendingDisc=${pendingDisconnected}`
      );
    }
  }

  private broadcastPlayerStatuses() {
    const statuses: Record<string, PlayerStatus> = {};
    for (const [id, status] of this.playerStatuses) {
      statuses[id] = status;
    }
    const msg: ServerMessage = { type: "PLAYER_STATUS_CHANGED", statuses };
    const data = JSON.stringify(msg);
    let count = 0;
    for (const [, connId] of this.playerToConnection) {
      const conn = this.room.getConnection(connId);
      if (!conn) continue;
      conn.send(data);
      count++;
    }
    if (process.env.NODE_ENV === "development") {
      console.log(
        `[room] → broadcast PLAYER_STATUS_CHANGED to ${count} client(s)`
      );
    }
  }
}
