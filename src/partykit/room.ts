import { Server, type Connection, type ConnectionContext } from "partyserver";
import type { Env } from "./env";
import type {
  Room,
  GameAction,
  SeriesState,
  StoryVoteResult,
} from "@/lib/game/types";
import type {
  ClientMessage,
  ServerMessage,
  PlayerStatus,
} from "@/lib/multiplayer/types";
import { PROTOCOL_VERSION } from "@/lib/multiplayer/types";
import { gameReducer, assembleStories } from "@/lib/game";
import { serializeRoomForArchive } from "@/lib/archive/serialize";

import {
  RECONNECT_TIMEOUT_MS,
  HOST_TRANSFER_TIMEOUT_MS,
  MAX_NAME_LENGTH,
  MAX_RESPONSE_LENGTH,
  VOTING_DURATION_MS,
  sanitize,
} from "./constants";

// Handler imports
import {
  handleJoinRoom,
  handlePlayerDisconnected,
  transferHost,
  checkForEmptyRoom,
} from "./handlers/connection";
import {
  handleStartGame,
  handleSubmitPrompt,
  handleHostAdvance,
  handleAdvanceReveal,
  handleRevealAdvance,
  handleEndGame,
  handleTypingStatus,
  startRoundTimer,
  clearRoundTimer as clearRoundTimerFn,
  roundTimerMs,
} from "./handlers/gameplay";
import {
  handlePlayAgain,
  handleQueueNextGame,
  handleCreateNextRoom,
  handleSetReady,
  handleNewRoom,
} from "./handlers/lobby";
import {
  handleStartVoting,
  handleSubmitVote,
  handleAdvanceVoting,
  closeVoting,
} from "./handlers/voting";

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

export default class RoomServer extends Server<Env> {
  // Compatibility facade: proxies PartyKit's `this.room.*` accessors onto
  // partyserver primitives so every handler module keeps calling
  // `server.room.*` unchanged. Getters (not eager reads) because `this.name`
  // is populated by partyserver on the first routed request.
  room: {
    id: string;
    env: Env;
    storage: DurableObjectStorage;
    getConnection: (id: string) => Connection | undefined;
    getConnections: () => Iterable<Connection>;
  };

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
  roundStartedAt: number | null = null;

  // Reveal state tracking
  revealStoryIndex: number = 0;
  revealedLineCount: number = 0;
  revealOrder: number[] = []; // shuffled story indices for reveal

  // If this room was created from the "Play Again" flow, this is the
  // name of the host from the previous game.
  preferredHostName: string | null = null;

  // Set when a round timer expired during a server restart
  pendingAdvanceAvailable: boolean = false;

  // --- Competitive mode state ---
  currentVotes: Map<string, { lineIndex: number; isStandingOvation: boolean }> = new Map();
  gameVoteResults: import("@/lib/game/types").StoryVoteResult[] = [];
  seriesState: import("@/lib/game/types").SeriesState | null = null;
  votingTimer: ReturnType<typeof setTimeout> | null = null;
  votingStartedAt: number | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const self = this;
    this.room = {
      get id() {
        return self.name;
      },
      get env() {
        return self.env;
      },
      get storage() {
        return self.ctx.storage;
      },
      getConnection: (id) => self.getConnection(id),
      getConnections: () => self.getConnections(),
    };
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  async onStart() {
    try {
      const stored = await this.room.storage.get<{
        gameState: Room;
        playerStatuses: Record<string, PlayerStatus>;
        roundStartedAt: number | null;
        revealStoryIndex: number;
        revealedLineCount: number;
        seriesState?: SeriesState | null;
        gameVoteResults?: StoryVoteResult[];
        currentVotes?: Record<
          string,
          { lineIndex: number; isStandingOvation: boolean }
        >;
      }>("snapshot");

      if (!stored?.gameState) return;

      this.gameState = {
        ...stored.gameState,
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
      // Restore the shuffled reveal order — without it, reveal advancement
      // (which walks revealOrder) wedges after a server restart mid-reveal.
      this.revealOrder = stored.gameState.revealOrder ?? [];

      // Restore competitive/series state.
      this.seriesState = stored.seriesState ?? null;
      this.gameVoteResults = stored.gameVoteResults ?? [];
      this.currentVotes = new Map(
        Object.entries(stored.currentVotes ?? {})
      );

      // Restore round timer with however much time remains.
      if (
        this.gameState.state === "PLAYING" &&
        stored.roundStartedAt !== null &&
        stored.roundStartedAt !== undefined
      ) {
        this.roundStartedAt = stored.roundStartedAt;
        const elapsed = Date.now() - stored.roundStartedAt;
        const remaining = roundTimerMs(this) - elapsed;

        if (remaining > 0) {
          this.roundTimer = setTimeout(() => {
            if (!this.gameState || this.gameState.state !== "PLAYING") return;
            const currentRound = this.gameState.currentRound;
            const unsubmittedCount = this.gameState.stories.filter(
              (s) => s.slots[currentRound]?.response === null
            ).length;
            this.broadcastToAll({ type: "ADVANCE_AVAILABLE", unsubmittedCount });
          }, remaining);
        } else {
          this.pendingAdvanceAvailable = true;
        }
      }

      // Restore the voting timer if a vote round was open when the DO restarted.
      if (
        this.gameState.state === "REVEAL" &&
        this.gameState.votingState?.phase === "voting" &&
        this.gameState.votingState.votingStartedAt
      ) {
        this.votingStartedAt = this.gameState.votingState.votingStartedAt;
        const remaining =
          VOTING_DURATION_MS -
          (Date.now() - this.gameState.votingState.votingStartedAt);
        this.votingTimer = setTimeout(() => {
          void closeVoting(this);
        }, Math.max(0, remaining));
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
              handlePlayerDisconnected(this, player.id);
            }, RECONNECT_TIMEOUT_MS);
            this.disconnectTimers.set(player.id, timer);
          }
        }

        if (this.gameState.hostId) {
          this.hostTransferTimer = setTimeout(() => {
            transferHost(this, this.gameState!.hostId);
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
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  /** Debounced state save — coalesces rapid writes into one storage put. */
  saveState(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
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
          // Competitive/series state so a restart mid-series doesn't lose
          // scores, votes, or the reveal order (revealOrder rides along on
          // gameState).
          seriesState: this.seriesState,
          gameVoteResults: this.gameVoteResults,
          currentVotes: Object.fromEntries(this.currentVotes),
        })
        .catch((err) => {
          console.error("[room] Failed to save state:", err);
        });
    }, 50);
  }

  onConnect(conn: Connection, ctx: ConnectionContext) {
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
          // Identity-takeover guard: only bind this connection to the
          // playerId if that player does NOT already have a live socket.
          // Otherwise anyone who put a known playerId (broadcast in every
          // STATE_UPDATE) in the query string would hijack that player —
          // and it would defeat handleJoinRoom's PLAYER_ALREADY_CONNECTED
          // check, which reads playerToConnection. A genuine reconnect has
          // a dead prior socket, so getConnection returns undefined and we
          // bind as before; the follow-up JOIN_ROOM is handled normally.
          const priorConnId = this.playerToConnection.get(playerId);
          const priorIsLive =
            priorConnId != null &&
            priorConnId !== conn.id &&
            this.room.getConnection(priorConnId) != null;
          if (priorIsLive) {
            // Leave the mapping pointing at the live socket. The takeover
            // attempt's JOIN_ROOM will be rejected with PLAYER_ALREADY_CONNECTED.
            return;
          }
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

  // partyserver reverses PartyKit's arg order: (connection, message).
  onMessage(sender: Connection, message: string) {
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

    // Sanitize user input at the boundary
    if (msg.type === "JOIN_ROOM" && msg.playerName) {
      msg = { ...msg, playerName: sanitize(msg.playerName, MAX_NAME_LENGTH) };
    }
    if (msg.type === "JOIN_ROOM" && msg.previousHostName) {
      msg = {
        ...msg,
        previousHostName: sanitize(msg.previousHostName, MAX_NAME_LENGTH),
      };
    }
    if (msg.type === "SUBMIT_PROMPT" && msg.response) {
      msg = { ...msg, response: sanitize(msg.response, MAX_RESPONSE_LENGTH) };
    }

    // A brand-new join (no reconnect id) must carry a non-empty name — an empty
    // one would create a nameless player and break the next joiner's name check.
    if (msg.type === "JOIN_ROOM" && !msg.playerId && !msg.playerName) {
      this.sendTo(sender, { type: "ERROR", reason: "A name is required" });
      sender.close();
      return;
    }

    switch (msg.type) {
      case "JOIN_ROOM":
        handleJoinRoom(this, msg, sender);
        break;
      case "START_GAME":
        handleStartGame(this, msg, sender);
        break;
      case "SUBMIT_PROMPT":
        handleSubmitPrompt(this, msg, sender);
        break;
      case "HOST_ADVANCE":
        handleHostAdvance(this, sender);
        break;
      case "ADVANCE_REVEAL":
        handleAdvanceReveal(this, sender);
        break;
      case "REVEAL_ADVANCE":
        handleRevealAdvance(this, sender);
        break;
      case "END_GAME":
        handleEndGame(this, sender);
        break;
      case "PLAY_AGAIN":
        handlePlayAgain(this, sender);
        break;
      case "QUEUE_NEXT_GAME":
        handleQueueNextGame(this, sender);
        break;
      case "CREATE_NEXT_ROOM":
        handleCreateNextRoom(this, sender);
        break;
      case "NEW_ROOM":
        handleNewRoom(this, sender);
        break;
      case "SET_READY":
        handleSetReady(this, msg, sender);
        break;
      case "TYPING_STATUS":
        handleTypingStatus(this, msg, sender);
        break;
      // Competitive mode
      case "START_VOTING":
        handleStartVoting(this, sender);
        break;
      case "SUBMIT_VOTE":
        handleSubmitVote(this, msg, sender);
        break;
      case "ADVANCE_VOTING":
        handleAdvanceVoting(this, sender);
        break;
      default:
        this.sendTo(sender, {
          type: "ERROR",
          reason: "Unknown message type",
        });
    }
  }

  onClose(conn: Connection) {
    const playerId = this.connectionToPlayer.get(conn.id);
    if (!playerId) return;

    this.connectionToPlayer.delete(conn.id);

    const storedConnId = this.playerToConnection.get(playerId);
    if (storedConnId === conn.id) {
      this.playerToConnection.delete(playerId);
    } else {
      return;
    }

    // If the disconnecting identity is a pending player, remove them
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
      checkForEmptyRoom(this);
      return;
    }

    // Mark player as reconnecting — but preserve "submitted" status
    const currentStatus = this.playerStatuses.get(playerId);
    if (currentStatus !== "submitted") {
      this.playerStatuses.set(playerId, "reconnecting");
    }
    this.broadcastPlayerStatuses();

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
          this.broadcastToAll({ type: "ADVANCE_AVAILABLE", unsubmittedCount });
        }
      }
    }

    // Set reconnect timeout
    const disconnectTimer = setTimeout(() => {
      handlePlayerDisconnected(this, playerId);
    }, RECONNECT_TIMEOUT_MS);
    this.disconnectTimers.set(playerId, disconnectTimer);

    // If this was the host, start host transfer timer
    if (this.gameState && this.gameState.hostId === playerId) {
      this.hostTransferTimer = setTimeout(() => {
        transferHost(this, playerId);
      }, HOST_TRANSFER_TIMEOUT_MS);
    }

    checkForEmptyRoom(this);
  }

  // --- Broadcasting ---

  sendTo(conn: Connection, msg: ServerMessage) {
    conn.send(JSON.stringify(msg));
  }

  broadcastToAll(msg: ServerMessage) {
    const data = JSON.stringify(msg);
    let count = 0;
    for (const conn of this.room.getConnections()) {
      // Only sockets that completed JOIN_ROOM get game content — a bare socket
      // opened to a room code must not be able to passively harvest stories/scores.
      if (!this.connectionToPlayer.has(conn.id)) continue;
      conn.send(data);
      count++;
    }
    if (process.env.NODE_ENV === "development") {
      console.log(`[room] → broadcast ${msg.type} to ${count} client(s)`);
    }
  }

  initRevealState() {
    const count = this.gameState?.stories.length ?? 0;
    const order = Array.from({ length: count }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    this.revealOrder = order;
    this.revealStoryIndex = order[0] ?? 0;
    this.revealedLineCount = 0;

    if (this.gameState) {
      this.gameState = { ...this.gameState, revealOrder: order };
    }
  }

  sendRevealSnapshotTo(conn: Connection) {
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

  broadcastRevealState() {
    this.saveState();
    if (!this.gameState) return;
    const currentStory = this.gameState.stories[this.revealStoryIndex];
    if (!currentStory) return;

    const readerSlot = currentStory.slots.find(s => s.promptIndex === 6);
    const readerId = readerSlot?.playerId ?? "";
    const readerPlayer = readerId ? this.gameState.players.find(p => p.id === readerId) : null;
    const readerName = readerPlayer?.name ?? "someone";

    this.broadcastToAll({
      type: "REVEAL_STATE",
      storyIndex: this.revealStoryIndex,
      revealedCount: this.revealedLineCount,
      readerId,
      readerName,
    });
  }

  computePendingCounts(): {
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
        if (this.playerToConnection.has(slot.playerId)) pendingConnected++;
        else pendingDisconnected++;
      }
    }
    return { pendingConnected, pendingDisconnected };
  }

  /**
   * Per-connection redaction of unrevealed responses.
   *
   * During PLAYING, the raw gameState carries every player's in-progress
   * responses. Shipping those to every client leaks what others wrote before
   * the reveal. We null out any response the recipient shouldn't see yet.
   *
   * The recipient legitimately needs, for the story they're assigned to this
   * round, the two character-name lines (acts 0 & 1) so the dialogue prompts
   * (acts 4-5) and the round-1 duplicate check can render — plus, of course,
   * their own writing. Everything else stays hidden until reveal.
   *
   * Redaction is scoped to PLAYING only. During REVEAL/END the reveal UI
   * renders from the separately-broadcast ASSEMBLED_STORIES and the voting /
   * end screens legitimately read full story content, so we return the room
   * untouched. The server always keeps full data internally (assembly,
   * archiving and scoring all read this.gameState, never the redacted copy).
   */
  private redactRoomFor(recipientId: string): Room {
    const room = this.gameState!;
    if (room.state !== "PLAYING") return room;

    const assignedStoryIndex = room.stories.find((s) =>
      s.slots.some(
        (sl) =>
          sl.promptIndex === room.currentRound && sl.playerId === recipientId
      )
    )?.index;

    return {
      ...room,
      stories: room.stories.map((story) => ({
        ...story,
        slots: story.slots.map((slot) => {
          if (slot.response === null) return slot;
          const ownedByRecipient = slot.playerId === recipientId;
          const isNeededCharacterLine =
            story.index === assignedStoryIndex &&
            (slot.promptIndex === 0 || slot.promptIndex === 1);
          if (ownedByRecipient || isNeededCharacterLine) return slot;
          return { ...slot, response: null };
        }),
      })),
    };
  }

  broadcastStateUpdate() {
    if (!this.gameState) return;

    if (this.pendingAdvanceAvailable && this.gameState.state === "PLAYING") {
      this.pendingAdvanceAvailable = false;
      const currentRound = this.gameState.currentRound;
      const unsubmittedCount = this.gameState.stories.filter(
        (s) => s.slots[currentRound]?.response === null
      ).length;
      this.broadcastToAll({ type: "ADVANCE_AVAILABLE", unsubmittedCount });
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
        room: this.redactRoomFor(playerId),
        playerId,
        roundStartedAt: this.roundStartedAt,
        roundDurationMs: roundTimerMs(this),
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

  broadcastPlayerStatuses(skipSave = false) {
    if (!skipSave) this.saveState();
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

  // --- Archiving ---

  async archiveRoom() {
    if (!this.gameState) return;
    // Capture which game we're archiving. The fetch can take seconds; if a
    // PLAY_AGAIN replaces the room meanwhile, we must not stamp this URL onto
    // the new game.
    const archivedCreatedAt = this.gameState.createdAt;
    const archivedCode = this.gameState.code;
    try {
      const archiveData = serializeRoomForArchive(
        this.gameState,
        this.gameState.gameMode === "competitive" ? this.gameVoteResults : undefined
      );
      const apiHost = (this.room.env.APP_URL as string) || process.env.APP_URL || "http://localhost:3000";
      const archiveSecret = this.room.env.ARCHIVE_SECRET as string | undefined;
      const response = await fetch(`${apiHost}/api/archive`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(archiveSecret ? { Authorization: `Bearer ${archiveSecret}` } : {}),
        },
        body: JSON.stringify(archiveData),
      });
      if (response.ok) {
        const { archiveUrl } = (await response.json()) as {
          archiveUrl: string;
        };
        // Only stamp the URL if the same game is still current — a PLAY_AGAIN
        // during the fetch would otherwise put this URL on the new game.
        if (
          this.gameState &&
          this.gameState.createdAt === archivedCreatedAt &&
          this.gameState.code === archivedCode
        ) {
          const action: GameAction = { type: "ARCHIVE_URL_SET", archiveUrl };
          this.gameState = gameReducer(this.gameState, action);
          this.broadcastStateUpdate();
        }
      } else {
        const text = await response.text().catch(() => "");
        console.error("Archive API returned", response.status, text);
      }
    } catch (error) {
      console.error("Failed to archive room:", error);
    }
  }

  // Convenience wrapper so handlers can call server.clearRoundTimer()
  clearRoundTimer() {
    clearRoundTimerFn(this);
  }
}
