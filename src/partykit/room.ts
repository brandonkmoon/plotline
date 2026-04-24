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
  revealOrder: number[] = []; // shuffled story indices for reveal

  // If this room was created from the "Play Again" flow, this is the
  // name of the host from the previous game. The first player to join
  // gets temporary host; when this player arrives, host transfers to them.
  preferredHostName: string | null = null;

  // Set when a round timer expired during a server restart — broadcast
  // ADVANCE_AVAILABLE to the first player who reconnects.
  private pendingAdvanceAvailable: boolean = false;

  // --- Competitive mode state ---
  // Votes for the current story being voted on (cleared per story)
  private currentVotes: Map<string, { lineIndex: number; isStandingOvation: boolean }> = new Map();
  // All vote results for the current game (cleared per game)
  private gameVoteResults: import("@/lib/game/types").StoryVoteResult[] = [];
  // Series state persists across games within a series
  private seriesState: import("@/lib/game/types").SeriesState | null = null;
  // Voting timer
  private votingTimer: ReturnType<typeof setTimeout> | null = null;
  private votingStartedAt: number | null = null;

  private static readonly VOTING_DURATION_MS = 30_000;

  constructor(room: Party.Room) {
    this.room = room;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  async onStart() {
    // Restore persisted state after a cold start or server migration.
    // Connection maps are rebuilt as players send JOIN_ROOM.
    try {
      const stored = await this.room.storage.get<{
        gameState: Room;
        playerStatuses: Record<string, PlayerStatus>;
        roundStartedAt: number | null;
        revealStoryIndex: number;
        revealedLineCount: number;
      }>("snapshot");

      if (!stored?.gameState) return;

      this.gameState = {
        ...stored.gameState,
        // Mark everyone as disconnected — connections are gone after restart.
        // They'll be restored to true as players send JOIN_ROOM.
        players: stored.gameState.players.map((p) => ({
          ...p,
          isConnected: false,
        })),
      };

      if (stored.playerStatuses) {
        this.playerStatuses = new Map(Object.entries(stored.playerStatuses));
      }

      this.revealStoryIndex = stored.revealStoryIndex ?? 0;
      this.revealedLineCount = stored.revealedLineCount ?? 0;

      // Restore round timer with however much time remains.
      if (
        this.gameState.state === "PLAYING" &&
        stored.roundStartedAt !== null &&
        stored.roundStartedAt !== undefined
      ) {
        this.roundStartedAt = stored.roundStartedAt;
        const elapsed = Date.now() - stored.roundStartedAt;
        const remaining = ROUND_TIMER_MS - elapsed;

        if (remaining > 0) {
          this.roundTimer = setTimeout(() => {
            if (!this.gameState || this.gameState.state !== "PLAYING") return;
            const currentRound = this.gameState.currentRound;
            const unsubmittedCount = this.gameState.stories.filter(
              (s) => s.slots[currentRound]?.response === null
            ).length;
            this.broadcast({ type: "ADVANCE_AVAILABLE", unsubmittedCount });
          }, remaining);
        } else {
          // Timer already expired during downtime — signal on first reconnect.
          this.pendingAdvanceAvailable = true;
        }
      }

      // Restart disconnect timers for any active player who isn't submitted.
      if (
        this.gameState.state === "PLAYING" ||
        this.gameState.state === "REVEAL"
      ) {
        for (const player of this.gameState.players) {
          const status = this.playerStatuses.get(player.id);
          if (status !== "submitted") {
            this.playerStatuses.set(player.id, "reconnecting");
            const timer = setTimeout(() => {
              this.handlePlayerDisconnected(player.id);
            }, RECONNECT_TIMEOUT_MS);
            this.disconnectTimers.set(player.id, timer);
          }
        }

        // Restart host transfer timer since host will need to reconnect too.
        if (this.gameState.hostId) {
          this.hostTransferTimer = setTimeout(() => {
            this.transferHost(this.gameState!.hostId);
          }, HOST_TRANSFER_TIMEOUT_MS);
        }
      }

      if (process.env.NODE_ENV === "development") {
        console.log(
          `[room] restored state: ${this.gameState.state} round=${this.gameState.currentRound} players=${this.gameState.players.length}`
        );
      }
    } catch (err) {
      console.error("[room] Failed to restore state from storage:", err);
    }
  }

  // Persist critical state to durable storage after every mutation.
  // Fire-and-forget — we never block the synchronous game loop on I/O.
  private saveState(): void {
    if (!this.gameState) {
      this.room.storage.deleteAll().catch(() => {});
      return;
    }
    this.room.storage
      .put("snapshot", {
        gameState: this.gameState,
        playerStatuses: Object.fromEntries(this.playerStatuses),
        roundStartedAt: this.roundStartedAt,
        revealStoryIndex: this.revealStoryIndex,
        revealedLineCount: this.revealedLineCount,
      })
      .catch((err) => {
        console.error("[room] Failed to save state:", err);
      });
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
        this.handleStartGame(msg, sender);
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
      case "CREATE_NEXT_ROOM":
        this.handleCreateNextRoom(sender);
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
      // Competitive mode
      case "START_VOTING":
        this.handleStartVoting(sender);
        break;
      case "SUBMIT_VOTE":
        this.handleSubmitVote(msg, sender);
        break;
      case "ADVANCE_VOTING":
        this.handleAdvanceVoting(sender);
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

    // Broadcast updated state so clients immediately get fresh
    // pendingConnected/pendingDisconnected counts reflecting the lost socket.
    // Also check if all remaining open-socket players have now submitted —
    // if so, the host can advance without waiting for the timer.
    if (this.gameState?.state === "PLAYING") {
      this.broadcastStateUpdate();
      const currentRound = this.gameState.currentRound;
      const allSocketSubmitted = this.gameState.stories.every((s) => {
        const slot = s.slots[currentRound];
        if (!slot || slot.response !== null) return true;
        return !this.playerToConnection.has(slot.playerId ?? "");
      });
      if (allSocketSubmitted) {
        const unsubmittedCount = this.gameState.stories.filter(
          (s) => s.slots[currentRound]?.response === null
        ).length;
        if (unsubmittedCount > 0) {
          this.broadcast({ type: "ADVANCE_AVAILABLE", unsubmittedCount });
        }
      }
    }

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

        this.ensureHostIsConnected();
        this.broadcastStateUpdate();
        this.broadcastPlayerStatuses();
        this.sendRevealSnapshotTo(sender);
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

        this.ensureHostIsConnected();
        this.broadcastStateUpdate();
        this.broadcastPlayerStatuses();
        this.sendRevealSnapshotTo(sender);
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

    // Track the preferred host from the previous game (first message wins)
    if (msg.previousHostName && this.preferredHostName === null) {
      this.preferredHostName = msg.previousHostName;
    }

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

    // If the previous game's host just joined, transfer host to them
    if (
      this.preferredHostName &&
      msg.playerName.toLowerCase() === this.preferredHostName.toLowerCase() &&
      this.gameState.hostId !== playerId
    ) {
      this.gameState = {
        ...this.gameState,
        hostId: playerId,
        players: this.gameState.players.map((p) => ({
          ...p,
          isHost: p.id === playerId,
        })),
        updatedAt: Date.now(),
      };
      this.preferredHostName = null; // consumed
    }

    // Set initial status
    this.playerStatuses.set(playerId, "idle");

    // Cancel room destroy timer
    if (this.roomDestroyTimer) {
      clearTimeout(this.roomDestroyTimer);
      this.roomDestroyTimer = null;
    }

    this.ensureHostIsConnected();
    this.broadcastStateUpdate();
    this.broadcastPlayerStatuses();
  }

  private handleStartGame(
    msg: Extract<ClientMessage, { type: "START_GAME" }>,
    sender: Party.Connection
  ) {
    if (!this.gameState) return;

    const playerId = this.connectionToPlayer.get(sender.id);
    if (!playerId || playerId !== this.gameState.hostId) {
      this.sendTo(sender, {
        type: "ERROR",
        reason: "Only the host can start the game",
      });
      return;
    }

    // Set game mode before starting
    const mode = msg.mode ?? "classic";
    this.gameState = { ...this.gameState, gameMode: mode };

    // Initialize series state for competitive mode
    if (mode === "competitive") {
      const totalGames = msg.seriesLength ?? 3;
      const currentGameNumber = this.seriesState
        ? this.seriesState.currentGameNumber + 1
        : 1;

      if (!this.seriesState) {
        // First game of a new series
        this.seriesState = {
          mode: "competitive",
          totalGames,
          currentGameNumber: 1,
          cumulativePoints: {},
          standingOvationsUsed: {},
          completedGames: [],
          awards: [],
        };
      } else {
        // Continuation of existing series
        this.seriesState.currentGameNumber = currentGameNumber;
        // Reset per-game standing ovation usage
        this.seriesState.standingOvationsUsed = {};
      }

      this.gameState.series = this.seriesState;
    }

    // Reset per-game vote state
    this.currentVotes.clear();
    this.gameVoteResults = [];

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
        // Players without an open socket don't block the advance.
        return !this.playerToConnection.has(slot.playerId ?? "");
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

    const playerId = this.connectionToPlayer.get(sender.id);
    if (!playerId) return;

    const isHost = playerId === this.gameState.hostId;

    // Also allow the current story's designated reader to advance —
    // they're the ones running the reveal and clicking "Next Story".
    const currentStory = this.gameState.stories[this.revealStoryIndex];
    const readerSlot = currentStory?.slots.find((s) => s.promptIndex === 6);
    const isReader = readerSlot?.playerId === playerId;

    if (!isHost && !isReader) {
      this.sendTo(sender, {
        type: "ERROR",
        reason: "Only the host or current reader can advance to the next story",
      });
      return;
    }

    // Mark the current story as revealed (if not already) and move on.
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
    this.gameState = gameReducer(this.gameState, action);

    // Advance to the next story in the shuffled reveal order
    const currentPos = this.revealOrder.indexOf(this.revealStoryIndex);
    const nextIdx = this.revealOrder[currentPos + 1];
    if (nextIdx !== undefined) {
      this.revealStoryIndex = nextIdx;
      this.revealedLineCount = 0;
      this.broadcastRevealState();
    }

    this.broadcastStateUpdate();

    // Archive when game transitions to END (all stories revealed)
    if (this.gameState.state === "END") {
      this.archiveRoom();
      // In competitive mode, compute and broadcast scores
      if (this.gameState.gameMode === "competitive") {
        this.computeAndBroadcastScores();
      }
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
      // Allow the host to reveal lines too — covers both "reader is
      // offline" and "reader is connected but idle/AFK" cases.
      const senderIsHost = playerId === this.gameState.hostId;
      if (!senderIsHost) {
        this.sendTo(sender, {
          type: "ERROR",
          reason: "Only the reader or host can advance the reveal",
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
      if (this.gameState.gameMode === "competitive") {
        this.computeAndBroadcastScores();
      }
    }
  }

  private handlePlayAgain(sender: Party.Connection) {
    if (!this.gameState) return;
    if (this.gameState.state !== "END" && this.gameState.state !== "REVEAL")
      return;

    const senderPlayerId = this.connectionToPlayer.get(sender.id);
    const senderPlayer = senderPlayerId
      ? this.gameState.players.find((p) => p.id === senderPlayerId)
      : null;

    // Any player who has queued for the next game can trigger the start —
    // not just the host. This lets the group move forward even if the
    // original host is slow or absent.
    if (!senderPlayer || !senderPlayer.queuedForNextGame) {
      this.sendTo(sender, {
        type: "ERROR",
        reason: "Only a queued player can start the next game",
      });
      return;
    }

    const now = Date.now();

    // New game host: original host if they queued; otherwise whoever started.
    const originalHost = this.gameState.players.find((p) => p.isHost);
    const host =
      originalHost?.queuedForNextGame ? originalHost : senderPlayer;
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

    // Re-add players who queued for the next game, connected or not.
    // A disconnected player who queued will appear in the new lobby as
    // disconnected and rejoin automatically when their socket reconnects.
    let state = newRoom;
    for (const player of this.gameState.players) {
      if (player.id === host.id) continue;
      if (!player.queuedForNextGame) continue;

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

    // Preserve competitive mode and series state across game resets
    if (this.seriesState && this.seriesState.currentGameNumber < this.seriesState.totalGames) {
      state.gameMode = "competitive";
      state.series = this.seriesState;
    }

    this.gameState = state;

    // Reset per-game vote tracking for the next game
    this.currentVotes.clear();
    this.gameVoteResults = [];

    // Rebuild playerStatuses from scratch — clearing ghost entries from
    // players who didn't carry over to the new game. Without this,
    // checkForEmptyRoom can see phantom "reconnecting" counts and never
    // start the room destroy timer.
    this.playerStatuses.clear();
    for (const p of this.gameState.players) {
      this.playerStatuses.set(p.id, p.isConnected ? "idle" : "reconnecting");
    }

    this.clearRoundTimer();
    this.broadcastStateUpdate();
    this.broadcastPlayerStatuses();
  }

  private handleQueueNextGame(sender: Party.Connection) {
    if (!this.gameState) return;
    if (this.gameState.state !== "END" && this.gameState.state !== "REVEAL") return;

    const playerId = this.connectionToPlayer.get(sender.id);
    if (!playerId) return;

    const action: GameAction = { type: "PLAYER_QUEUED_NEXT", playerId };
    this.gameState = gameReducer(this.gameState, action);
    this.broadcastStateUpdate();
  }

  private handleCreateNextRoom(sender: Party.Connection) {
    if (!this.gameState) return;
    if (this.gameState.state !== "END" && this.gameState.state !== "REVEAL") return;

    // Idempotent: if a next room code already exists, just resend state
    if (this.gameState.nextRoomCode) {
      this.broadcastStateUpdate();
      return;
    }

    const nextRoomCode = generateRoomCode();
    const action: GameAction = { type: "NEXT_ROOM_CREATED", nextRoomCode };
    const newState = gameReducer(this.gameState, action);
    if (newState === this.gameState) return;

    this.gameState = newState;
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

  // Called after every join/reconnect. If the current host is offline
  // (e.g. they disconnected when no one else was connected, so the
  // timed transfer found no candidates), promote the earliest-joined
  // connected player now that someone is back.
  private ensureHostIsConnected() {
    if (!this.gameState) return;

    const host = this.gameState.players.find(
      (p) => p.id === this.gameState!.hostId
    );
    if (host?.isConnected) return; // all good

    // Cancel any pending transfer timer — we're handling it now
    if (this.hostTransferTimer) {
      clearTimeout(this.hostTransferTimer);
      this.hostTransferTimer = null;
    }

    const connectedPlayers = this.gameState.players
      .filter((p) => p.isConnected && p.id !== this.gameState!.hostId)
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
      const apiHost = (this.room.env.APP_URL as string) || process.env.APP_URL || "http://localhost:3000";
      const response = await fetch(`${apiHost}/api/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(archiveData),
      });
      if (response.ok) {
        const { archiveUrl } = await response.json();
        // Store in game state so every future STATE_UPDATE carries it —
        // players who reconnect or refresh still see the archive link.
        if (this.gameState) {
          const action: GameAction = { type: "ARCHIVE_URL_SET", archiveUrl };
          this.gameState = gameReducer(this.gameState, action);
        }
        this.broadcastStateUpdate();
      } else {
        const text = await response.text().catch(() => "");
        console.error("Archive API returned", response.status, text);
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
    // Shuffle story reveal order (Fisher-Yates) so the sequence isn't
    // tied to join order / rotation index.
    const count = this.gameState?.stories.length ?? 0;
    const order = Array.from({ length: count }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    this.revealOrder = order;
    this.revealStoryIndex = order[0] ?? 0;
    this.revealedLineCount = 0;

    // Store on room state so clients can sort story cards in reveal order
    if (this.gameState) {
      this.gameState = { ...this.gameState, revealOrder: order };
    }
  }

  // Send assembled stories + current reveal position to a single reconnecting
  // player. Called when a player reconnects mid-reveal so they don't get a
  // blank screen waiting for a broadcast that already happened.
  private sendRevealSnapshotTo(conn: Party.Connection) {
    if (!this.gameState || this.gameState.state !== "REVEAL") return;

    const stories = assembleStories(this.gameState);
    this.sendTo(conn, { type: "ASSEMBLED_STORIES", stories });

    const currentStory = this.gameState.stories[this.revealStoryIndex];
    if (!currentStory) return;

    const readerSlot = currentStory.slots.find((s) => s.promptIndex === 6);
    const readerId = readerSlot?.playerId ?? "";
    const readerPlayer = readerId
      ? this.gameState.players.find((p) => p.id === readerId)
      : null;
    const readerName = readerPlayer?.name ?? "someone";

    this.sendTo(conn, {
      type: "REVEAL_STATE",
      storyIndex: this.revealStoryIndex,
      revealedCount: this.revealedLineCount,
      readerId,
      readerName,
    });
  }

  private broadcastRevealState() {
    this.saveState();
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
        // Use playerToConnection (active socket) rather than player.isConnected
        // so that reconnecting players (socket gone, 2-min timer pending) are
        // counted as disconnected immediately rather than blocking the advance.
        if (this.playerToConnection.has(slot.playerId)) pendingConnected++;
        else pendingDisconnected++;
      }
    }
    return { pendingConnected, pendingDisconnected };
  }

  private broadcastStateUpdate() {
    if (!this.gameState) return;

    // If the round timer expired during a server restart, notify everyone now.
    if (this.pendingAdvanceAvailable && this.gameState.state === "PLAYING") {
      this.pendingAdvanceAvailable = false;
      const currentRound = this.gameState.currentRound;
      const unsubmittedCount = this.gameState.stories.filter(
        (s) => s.slots[currentRound]?.response === null
      ).length;
      this.broadcast({ type: "ADVANCE_AVAILABLE", unsubmittedCount });
    }

    this.saveState();

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
    this.saveState();
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

  // ═══════════════════════════════════════════════════════════
  // COMPETITIVE MODE — Voting, Scoring, Awards
  // ═══════════════════════════════════════════════════════════

  private handleStartVoting(sender: Party.Connection) {
    if (!this.gameState) return;
    if (this.gameState.state !== "REVEAL") return;
    if (this.gameState.gameMode !== "competitive") return;

    const playerId = this.connectionToPlayer.get(sender.id);
    if (!playerId) return;

    // Only the reader or host can start voting
    const currentStory = this.gameState.stories[this.revealStoryIndex];
    const readerSlot = currentStory?.slots.find((s) => s.promptIndex === 6);
    const readerId = readerSlot?.playerId;
    const isHost = playerId === this.gameState.hostId;
    if (playerId !== readerId && !isHost) return;

    // Don't start voting twice for the same story
    if (
      this.gameState.votingState?.storyIndex === this.revealStoryIndex &&
      this.gameState.votingState?.phase === "voting"
    ) {
      return;
    }

    // Clear previous votes
    this.currentVotes.clear();

    // Set voting state
    const now = Date.now();
    this.votingStartedAt = now;
    this.gameState = {
      ...this.gameState,
      votingState: {
        storyIndex: this.revealStoryIndex,
        phase: "voting",
        votesReceived: [],
        votingStartedAt: now,
      },
    };

    // Broadcast voting open
    this.broadcast({
      type: "VOTING_OPEN",
      storyIndex: this.revealStoryIndex,
      votingStartedAt: now,
      votingDurationMs: RoomServer.VOTING_DURATION_MS,
    });

    // Timer is purely visual on the client side — no server-side
    // auto-close. The host manually advances via ADVANCE_VOTING.
    this.clearVotingTimer();
    this.broadcastStateUpdate();
  }

  private handleSubmitVote(
    msg: Extract<ClientMessage, { type: "SUBMIT_VOTE" }>,
    sender: Party.Connection
  ) {
    if (!this.gameState) return;
    if (this.gameState.state !== "REVEAL") return;
    if (this.gameState.gameMode !== "competitive") return;
    if (this.gameState.votingState?.phase !== "voting") return;
    if (msg.storyIndex !== this.gameState.votingState.storyIndex) return;

    const playerId = this.connectionToPlayer.get(sender.id);
    if (!playerId) return;

    // Can't vote for your own line
    const currentStory = this.gameState.stories[this.revealStoryIndex];
    if (!currentStory) return;
    const slot = currentStory.slots[msg.lineIndex];
    if (slot?.playerId === playerId) {
      this.sendTo(sender, { type: "ERROR", reason: "Cannot vote for your own line" });
      return;
    }

    // Check standing ovation eligibility
    if (msg.isStandingOvation) {
      if (this.seriesState?.standingOvationsUsed[playerId]) {
        this.sendTo(sender, { type: "ERROR", reason: "Standing ovation already used this game" });
        return;
      }
    }

    // Store/update vote (one per player per story)
    this.currentVotes.set(playerId, {
      lineIndex: msg.lineIndex,
      isStandingOvation: msg.isStandingOvation,
    });

    // Mark standing ovation as used
    if (msg.isStandingOvation && this.seriesState) {
      this.seriesState.standingOvationsUsed[playerId] = true;
    }

    // Update votes received list
    const votesReceived = Array.from(this.currentVotes.keys());
    this.gameState = {
      ...this.gameState,
      votingState: {
        ...this.gameState.votingState!,
        votesReceived,
      },
    };

    this.broadcastStateUpdate();
  }

  // Host taps "Next Story" during or after voting. Tallies whatever
  // votes are in, stores results, marks story as revealed, advances.
  // One action — no intermediate "closed" state.
  private handleAdvanceVoting(sender: Party.Connection) {
    if (!this.gameState) return;
    if (this.gameState.state !== "REVEAL") return;
    if (this.gameState.votingState?.phase !== "voting") return;

    const playerId = this.connectionToPlayer.get(sender.id);
    if (!playerId || playerId !== this.gameState.hostId) return;

    this.clearVotingTimer();

    const storyIndex = this.revealStoryIndex;
    const currentStory = this.gameState.stories[storyIndex];
    if (!currentStory) return;

    // Assign random votes for connected players who didn't vote.
    // This removes the advantage of not voting.
    const connectedPlayers = this.gameState.players.filter((p) => p.isConnected);
    for (const player of connectedPlayers) {
      if (!this.currentVotes.has(player.id)) {
        // Pick a random line this player didn't write
        const mySlots = new Set(
          currentStory.slots
            .filter((s) => s.playerId === player.id)
            .map((_, i) => i)
        );
        // Actually need slot index, not filter index
        const eligible: number[] = [];
        for (let i = 0; i < currentStory.slots.length; i++) {
          if (currentStory.slots[i]?.playerId !== player.id) {
            eligible.push(i);
          }
        }
        if (eligible.length > 0) {
          const randomLine = eligible[Math.floor(Math.random() * eligible.length)];
          this.currentVotes.set(player.id, {
            lineIndex: randomLine,
            isStandingOvation: false,
          });
        }
      }
    }

    // Tally all votes (including auto-assigned)
    const lineTallies: number[] = new Array(7).fill(0);
    const votes: import("@/lib/game/types").Vote[] = [];

    for (const [voterId, vote] of this.currentVotes) {
      const points = vote.isStandingOvation ? 3 : 1;
      lineTallies[vote.lineIndex] += points;
      votes.push({
        voterId,
        storyIndex,
        lineIndex: vote.lineIndex,
        isStandingOvation: vote.isStandingOvation,
      });
    }

    // Find winning line
    let winningLineIndex = 0;
    let maxTally = 0;
    for (let i = 0; i < lineTallies.length; i++) {
      if (lineTallies[i] > maxTally) {
        maxTally = lineTallies[i];
        winningLineIndex = i;
      }
    }

    const winningSlot = currentStory.slots[winningLineIndex];
    const winningAuthorId = winningSlot?.playerId ?? "";

    // Snapshot line data for cross-game awards
    const lineAuthors: Record<number, string> = {};
    const lineTexts: Record<number, string> = {};
    for (let i = 0; i < currentStory.slots.length; i++) {
      if (currentStory.slots[i]?.playerId) {
        lineAuthors[i] = currentStory.slots[i].playerId!;
      }
      if (currentStory.slots[i]?.response) {
        lineTexts[i] = currentStory.slots[i].response!;
      }
    }

    this.gameVoteResults.push({
      storyIndex,
      votes,
      winningLineIndex,
      winningAuthorId,
      winningLineText: winningSlot?.response ?? "",
      lineAuthors,
      lineTexts,
    });

    this.currentVotes.clear();

    // Now advance — mark story revealed, clear voting, move to next
    this.advanceAfterVoting();
  }

  // Marks the current story as revealed, clears voting state, and
  // advances to the next story in the shuffled reveal order.
  private advanceAfterVoting() {
    if (!this.gameState || this.gameState.state !== "REVEAL") return;

    const storyIndex = this.revealStoryIndex;

    // Mark current story as revealed
    const action: GameAction = {
      type: "STORY_REVEALED",
      storyIndex,
      timestamp: Date.now(),
    };
    this.gameState = gameReducer(this.gameState, action);

    // Clear voting state
    this.gameState = {
      ...this.gameState,
      votingState: undefined,
    };

    // Advance to next story in shuffled order
    const currentPos = this.revealOrder.indexOf(this.revealStoryIndex);
    const nextIdx = this.revealOrder[currentPos + 1];
    if (nextIdx !== undefined) {
      this.revealStoryIndex = nextIdx;
      this.revealedLineCount = 0;
      this.broadcastRevealState();
    }

    this.broadcastStateUpdate();

    // If all stories revealed → END
    if (this.gameState.state === "END") {
      this.archiveRoom();
      if (this.gameState.gameMode === "competitive") {
        this.computeAndBroadcastScores();
      }
    }
  }

  private clearVotingTimer() {
    if (this.votingTimer) {
      clearTimeout(this.votingTimer);
      this.votingTimer = null;
    }
    this.votingStartedAt = null;
  }

  // Called when the game transitions to END in competitive mode.
  // Computes points, Line of the Game, updates series state, and
  // broadcasts scores (and awards if it's the final game).
  private computeAndBroadcastScores() {
    if (!this.gameState || !this.seriesState) return;

    const points: Record<string, number> = {};
    // Initialize all players to 0
    for (const p of this.gameState.players) {
      points[p.id] = 0;
    }

    // Calculate points from all vote results this game
    let lineOfTheGame: import("@/lib/game/types").GameScores["lineOfTheGame"] = null;
    let maxVoteCount = 0;

    for (const result of this.gameVoteResults) {
      for (const vote of result.votes) {
        const authorId = result.lineAuthors[vote.lineIndex];
        if (!authorId) continue;

        if (vote.isStandingOvation) {
          // 3 points to author, 2 to voter
          points[authorId] = (points[authorId] ?? 0) + 3;
          points[vote.voterId] = (points[vote.voterId] ?? 0) + 2;
        } else {
          // 1 point to author
          points[authorId] = (points[authorId] ?? 0) + 1;
        }
      }

      // Track Line of the Game (most raw votes, not weighted)
      const rawCounts: number[] = new Array(7).fill(0);
      for (const vote of result.votes) {
        rawCounts[vote.lineIndex]++;
      }
      for (let i = 0; i < rawCounts.length; i++) {
        if (rawCounts[i] > maxVoteCount) {
          maxVoteCount = rawCounts[i];
          const authorId = result.lineAuthors[i] ?? "";
          const slot = this.gameState.stories[result.storyIndex]?.slots[i];
          const author = this.gameState.players.find((p) => p.id === authorId);
          lineOfTheGame = {
            storyIndex: result.storyIndex,
            lineIndex: i,
            text: slot?.response ?? "",
            authorId: slot?.playerId ?? "",
            authorName: author?.name ?? "Unknown",
            voteCount: rawCounts[i],
          };
        }
      }
    }

    // Double points in the final game
    const isFinalGame =
      this.seriesState.currentGameNumber >= this.seriesState.totalGames;
    if (isFinalGame) {
      for (const id of Object.keys(points)) {
        points[id] *= 2;
      }
    }

    const gameScores: import("@/lib/game/types").GameScores = {
      points,
      lineOfTheGame,
    };

    // Update cumulative series points
    for (const [id, pts] of Object.entries(points)) {
      this.seriesState.cumulativePoints[id] =
        (this.seriesState.cumulativePoints[id] ?? 0) + pts;
    }

    // Store completed game
    this.seriesState.completedGames.push({
      gameNumber: this.seriesState.currentGameNumber,
      scores: gameScores,
      voteResults: [...this.gameVoteResults],
    });

    // Broadcast game scores
    this.broadcast({
      type: "GAME_SCORES",
      scores: gameScores,
      voteResults: this.gameVoteResults,
      gameNumber: this.seriesState.currentGameNumber,
      seriesStandings: { ...this.seriesState.cumulativePoints },
    });

    // If final game, compute and broadcast awards
    if (isFinalGame) {
      const awards = this.computeSeriesAwards();
      this.seriesState.awards = awards;
      this.broadcast({
        type: "SERIES_AWARDS",
        awards,
        finalStandings: { ...this.seriesState.cumulativePoints },
      });
    }
  }

  private computeSeriesAwards(): import("@/lib/game/types").SeriesAward[] {
    if (!this.gameState || !this.seriesState) return [];

    const awards: import("@/lib/game/types").SeriesAward[] = [];
    const players = this.gameState.players;
    const allResults = this.seriesState.completedGames.flatMap((g) => g.voteResults);

    // Helper: count votes by line type across all games
    const votesByPlayerByActs = (acts: number[]) => {
      const counts: Record<string, number> = {};
      for (const result of allResults) {
        for (const vote of result.votes) {
          if (acts.includes(vote.lineIndex)) {
            const authorId = result.lineAuthors[vote.lineIndex];
            if (authorId) {
              counts[authorId] = (counts[authorId] ?? 0) + 1;
            }
          }
        }
      }
      return counts;
    };

    const findTop = (counts: Record<string, number>) => {
      let topId = "";
      let topCount = 0;
      for (const [id, count] of Object.entries(counts)) {
        if (count > topCount) {
          topCount = count;
          topId = id;
        }
      }
      return topId;
    };

    const nameOf = (id: string) =>
      players.find((p) => p.id === id)?.name ?? "Unknown";

    // MVP — most cumulative points
    const mvpId = findTop(this.seriesState.cumulativePoints);
    if (mvpId) {
      awards.push({
        id: "mvp",
        title: "MVP",
        playerId: mvpId,
        playerName: nameOf(mvpId),
      });
    }

    // Casting Director — most votes on acts 0-1 (character names)
    const castingCounts = votesByPlayerByActs([0, 1]);
    const castingId = findTop(castingCounts);
    if (castingId) {
      awards.push({
        id: "casting-director",
        title: "Casting Director",
        playerId: castingId,
        playerName: nameOf(castingId),
      });
    }

    // Scene Stealer — most votes on acts 2-3 (location/action)
    const sceneCounts = votesByPlayerByActs([2, 3]);
    const sceneId = findTop(sceneCounts);
    if (sceneId) {
      awards.push({
        id: "scene-stealer",
        title: "Scene Stealer",
        playerId: sceneId,
        playerName: nameOf(sceneId),
      });
    }

    // Speechwriter — most votes on acts 4-5 (dialogue)
    const speechCounts = votesByPlayerByActs([4, 5]);
    const speechId = findTop(speechCounts);
    if (speechId) {
      awards.push({
        id: "speechwriter",
        title: "Speechwriter",
        playerId: speechId,
        playerName: nameOf(speechId),
      });
    }

    // Closer — most votes on act 6 (ending)
    const closerCounts = votesByPlayerByActs([6]);
    const closerId = findTop(closerCounts);
    if (closerId) {
      awards.push({
        id: "closer",
        title: "Closer",
        playerId: closerId,
        playerName: nameOf(closerId),
      });
    }

    // Fan Favorite — most standing ovations received
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
      awards.push({
        id: "fan-favorite",
        title: "Fan Favorite",
        playerId: fanFavId,
        playerName: nameOf(fanFavId),
      });
    }

    // Line of the Series — single most-voted line across all games
    let bestLineText = "";
    let bestLineAuthorId = "";
    let bestLineVotes = 0;
    for (const result of allResults) {
      const rawCounts: number[] = new Array(7).fill(0);
      for (const vote of result.votes) {
        rawCounts[vote.lineIndex]++;
      }
      for (let i = 0; i < rawCounts.length; i++) {
        if (rawCounts[i] > bestLineVotes) {
          bestLineVotes = rawCounts[i];
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

    return awards;
  }
}
