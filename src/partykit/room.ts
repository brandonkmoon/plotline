import type * as Party from "partykit/server";
import type { Room, Player, GameAction } from "@/lib/game/types";
import type {
  ClientMessage,
  ServerMessage,
  PlayerStatus,
} from "@/lib/multiplayer/types";
import { gameReducer, createRoom, assembleStories } from "@/lib/game";
import { serializeRoomForArchive } from "@/lib/archive/serialize";

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
    // Don't add player yet - wait for JOIN_ROOM message
    // The connection is stored automatically by PartyKit
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

    // Clean up connection maps
    this.connectionToPlayer.delete(conn.id);
    this.playerToConnection.delete(playerId);

    // Mark player as reconnecting
    this.playerStatuses.set(playerId, "reconnecting");
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

    // Reconnection case
    if (msg.playerId && this.gameState) {
      const existingPlayer = this.gameState.players.find(
        (p) => p.id === msg.playerId
      );
      if (existingPlayer) {
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

        // Restore status
        this.playerStatuses.set(existingPlayer.id, "idle");

        // Cancel room destroy timer if we have players again
        if (this.roomDestroyTimer) {
          clearTimeout(this.roomDestroyTimer);
          this.roomDestroyTimer = null;
        }

        this.broadcastStateUpdate();
        this.broadcastPlayerStatuses();
        return;
      }
    }

    // New player
    const playerId = msg.playerId || crypto.randomUUID();

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

      // Check if player was actually added (reducer might reject)
      if (newState === this.gameState) {
        this.sendTo(sender, {
          type: "ERROR",
          reason:
            this.gameState.state !== "LOBBY"
              ? "Game already in progress"
              : "Room is full",
        });
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
      // Round auto-advanced, restart timer and reset statuses
      this.resetPlayerStatusesForNewRound();
      this.startRoundTimer();
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

    // Find the next unrevealed story
    const nextStory = this.gameState.stories.find((s) => !s.isRevealed);
    if (!nextStory) return;

    const now = Date.now();
    const action: GameAction = {
      type: "STORY_REVEALED",
      storyIndex: nextStory.index,
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
      this.sendTo(sender, {
        type: "ERROR",
        reason: "Only the reader can advance the reveal",
      });
      return;
    }

    this.revealedLineCount++;

    if (this.revealedLineCount >= 7) {
      // Mark current story as revealed
      const now = Date.now();
      const action: GameAction = {
        type: "STORY_REVEALED",
        storyIndex: this.revealStoryIndex,
        timestamp: now,
      };
      this.gameState = gameReducer(this.gameState, action);

      // Check if all stories revealed
      const nextUnrevealed = this.gameState.stories.find((s) => !s.isRevealed);
      if (!nextUnrevealed) {
        // All done - transition to END
        this.broadcastRevealState();
        this.broadcastStateUpdate();
        this.archiveRoom();
        return;
      } else {
        // Move to next story
        this.revealStoryIndex = nextUnrevealed.index;
        this.revealedLineCount = 0;
      }
    }

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

    const now = Date.now();
    const host = this.gameState.players.find((p) => p.isHost);
    if (!host) return;

    // Create fresh room with same code and players
    const newRoom = createRoom(
      this.gameState.code,
      { id: host.id, name: host.name },
      now
    );

    // Re-add all other connected players
    let state = newRoom;
    for (const player of this.gameState.players) {
      if (player.id === host.id) continue;
      if (!player.isConnected) continue;

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

    this.gameState = state;

    // Reset statuses
    for (const p of this.gameState.players) {
      this.playerStatuses.set(p.id, "idle");
    }

    this.clearRoundTimer();
    this.broadcastStateUpdate();
    this.broadcastPlayerStatuses();
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
    for (const conn of this.room.getConnections()) {
      conn.send(data);
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

  private broadcastStateUpdate() {
    if (!this.gameState) return;

    for (const conn of this.room.getConnections()) {
      const playerId = this.connectionToPlayer.get(conn.id);
      if (playerId) {
        this.sendTo(conn, {
          type: "STATE_UPDATE",
          room: this.gameState,
          playerId,
          roundStartedAt: this.roundStartedAt,
        });
      }
    }
  }

  private broadcastPlayerStatuses() {
    const statuses: Record<string, PlayerStatus> = {};
    for (const [id, status] of this.playerStatuses) {
      statuses[id] = status;
    }
    this.broadcast({ type: "PLAYER_STATUS_CHANGED", statuses });
  }
}
