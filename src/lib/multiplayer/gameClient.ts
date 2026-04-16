import PartySocket from "partysocket";
import type { Room, AssembledStory } from "@/lib/game/types";
import type {
  ClientMessage,
  ServerMessage,
  PlayerStatus,
  ConnectionErrorReason,
} from "@/lib/multiplayer/types";
import { PROTOCOL_VERSION } from "@/lib/multiplayer/types";

export interface RevealState {
  storyIndex: number;
  revealedCount: number;
  readerId: string;
  readerName: string;
}

type StateCallback = (room: Room) => void;
type StatusCallback = (statuses: Record<string, PlayerStatus>) => void;
type ErrorCallback = (reason: string) => void;
type ConnectionErrorCallback = (reason: ConnectionErrorReason) => void;
type AdvanceCallback = (count: number) => void;
type StoriesCallback = (stories: AssembledStory[]) => void;
type ArchiveReadyCallback = (archiveUrl: string) => void;
type RevealStateCallback = (state: RevealState) => void;

const CONNECT_TIMEOUT_MS = 10_000;
const DEFAULT_ROUND_DURATION_MS = 90_000;

// --- sessionStorage helpers ---
// Per-tab identity: each browser tab gets its own playerId so multiple
// tabs in the same browser are treated as distinct players. Refreshing
// a tab keeps the same identity (reconnect).

function getStoredPlayerId(roomCode: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(`plotline.playerId.${roomCode}`);
  } catch {
    return null;
  }
}

function storePlayerId(roomCode: string, playerId: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(`plotline.playerId.${roomCode}`, playerId);
  } catch {
    // ignore
  }
}

function clearStoredPlayerId(roomCode: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(`plotline.playerId.${roomCode}`);
  } catch {
    // ignore
  }
}

class GameClient {
  private socket: PartySocket | null = null;
  private playerId: string | null = null;
  private roomCode: string | null = null;
  private stateListeners: Set<StateCallback> = new Set();
  private statusListeners: Set<StatusCallback> = new Set();
  private errorListeners: Set<ErrorCallback> = new Set();
  private connectionErrorListeners: Set<ConnectionErrorCallback> = new Set();
  private advanceListeners: Set<AdvanceCallback> = new Set();
  private storiesListeners: Set<StoriesCallback> = new Set();
  private archiveReadyListeners: Set<ArchiveReadyCallback> = new Set();
  private revealStateListeners: Set<RevealStateCallback> = new Set();
  private messageLogListeners: Set<
    (entry: { direction: "in" | "out"; data: string; timestamp: number }) => void
  > = new Set();

  // Cache latest values so new subscribers get the current state immediately
  private latestRoom: Room | null = null;
  private latestStatuses: Record<string, PlayerStatus> | null = null;
  private latestStories: AssembledStory[] | null = null;
  private latestRoundStartedAt: number | null = null;
  private latestRoundDurationMs: number = DEFAULT_ROUND_DURATION_MS;
  private latestPendingConnected: number = 0;
  private latestPendingDisconnected: number = 0;
  private latestRevealState: RevealState | null = null;
  private connectionError: ConnectionErrorReason | null = null;

  async connect(
    roomCode: string,
    playerName: string,
    existingPlayerId?: string,
    options?: { forceNewPlayer?: boolean }
  ): Promise<string> {
    this.roomCode = roomCode;
    this.connectionError = null;

    // Determine which playerId to send:
    // - If forceNewPlayer is true: never reconnect, always join as new
    //   (also clear any stale sessionStorage entry for this room)
    // - Otherwise: prefer explicit arg, fall back to sessionStorage
    let playerIdToSend: string | undefined;
    if (options?.forceNewPlayer) {
      clearStoredPlayerId(roomCode);
      playerIdToSend = undefined;
    } else {
      playerIdToSend = existingPlayerId ?? getStoredPlayerId(roomCode) ?? undefined;
    }

    return new Promise((resolve, reject) => {
      let resolved = false;

      const connectTimeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.emitConnectionError("CONNECT_TIMEOUT");
          try {
            this.socket?.close();
          } catch {
            // ignore
          }
          reject(new Error("CONNECT_TIMEOUT"));
        }
      }, CONNECT_TIMEOUT_MS);

      this.socket = new PartySocket({
        host: process.env.NEXT_PUBLIC_PARTYKIT_HOST || "localhost:1999",
        room: roomCode,
      });

      this.socket.addEventListener("open", () => {
        const joinMsg: ClientMessage = {
          type: "JOIN_ROOM",
          playerName,
          protocolVersion: PROTOCOL_VERSION,
          ...(playerIdToSend ? { playerId: playerIdToSend } : {}),
        };
        this.send(joinMsg);
      });

      this.socket.addEventListener("message", (event) => {
        const data =
          typeof event.data === "string" ? event.data : String(event.data);

        // Log incoming message
        for (const listener of this.messageLogListeners) {
          listener({ direction: "in", data, timestamp: Date.now() });
        }

        let msg: ServerMessage;
        try {
          msg = JSON.parse(data);
        } catch {
          return;
        }

        switch (msg.type) {
          case "STATE_UPDATE":
            this.playerId = msg.playerId;
            this.latestRoom = msg.room;
            this.latestRoundStartedAt = msg.roundStartedAt ?? null;
            this.latestRoundDurationMs =
              typeof msg.roundDurationMs === "number" &&
              Number.isFinite(msg.roundDurationMs)
                ? msg.roundDurationMs
                : DEFAULT_ROUND_DURATION_MS;
            this.latestPendingConnected =
              typeof msg.pendingConnected === "number"
                ? msg.pendingConnected
                : 0;
            this.latestPendingDisconnected =
              typeof msg.pendingDisconnected === "number"
                ? msg.pendingDisconnected
                : 0;
            // Persist playerId
            storePlayerId(roomCode, msg.playerId);
            for (const cb of this.stateListeners) cb(msg.room);
            if (!resolved) {
              resolved = true;
              clearTimeout(connectTimeout);
              resolve(msg.playerId);
            }
            break;

          case "PLAYER_STATUS_CHANGED":
            this.latestStatuses = msg.statuses;
            for (const cb of this.statusListeners) cb(msg.statuses);
            break;

          case "ERROR":
            for (const cb of this.errorListeners) cb(msg.reason);
            if (
              msg.reason === "GAME_IN_PROGRESS" ||
              msg.reason === "UNKNOWN_PLAYER" ||
              msg.reason === "PROTOCOL_MISMATCH" ||
              msg.reason === "PLAYER_ALREADY_CONNECTED"
            ) {
              // Clear stored playerId on PLAYER_ALREADY_CONNECTED so a
              // refresh doesn't repeat the conflict
              if (msg.reason === "PLAYER_ALREADY_CONNECTED") {
                clearStoredPlayerId(roomCode);
              }
              this.emitConnectionError(msg.reason);
            }
            if (!resolved) {
              resolved = true;
              clearTimeout(connectTimeout);
              reject(new Error(msg.reason));
            }
            break;

          case "ADVANCE_AVAILABLE":
            for (const cb of this.advanceListeners) cb(msg.unsubmittedCount);
            break;

          case "ASSEMBLED_STORIES":
            this.latestStories = msg.stories;
            for (const cb of this.storiesListeners) cb(msg.stories);
            break;

          case "ARCHIVE_READY":
            for (const cb of this.archiveReadyListeners) cb(msg.archiveUrl);
            break;

          case "REVEAL_STATE":
            this.latestRevealState = {
              storyIndex: msg.storyIndex,
              revealedCount: msg.revealedCount,
              readerId: msg.readerId,
              readerName: msg.readerName,
            };
            for (const cb of this.revealStateListeners) cb(this.latestRevealState);
            break;
        }
      });

      this.socket.addEventListener("error", () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(connectTimeout);
          reject(new Error("WebSocket connection failed"));
        }
      });
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.playerId = null;
    this.roomCode = null;
    this.latestRoom = null;
    this.latestStatuses = null;
    this.latestStories = null;
    this.latestRoundStartedAt = null;
    this.latestRoundDurationMs = DEFAULT_ROUND_DURATION_MS;
    this.latestPendingConnected = 0;
    this.latestPendingDisconnected = 0;
    this.latestRevealState = null;
    this.connectionError = null;
  }

  // --- Actions ---

  startGame(): void {
    this.send({ type: "START_GAME" });
  }

  submitPrompt(
    storyIndex: number,
    promptIndex: number,
    response: string
  ): void {
    this.send({
      type: "SUBMIT_PROMPT",
      storyIndex,
      promptIndex,
      response,
    });
  }

  hostAdvance(): void {
    this.send({ type: "HOST_ADVANCE" });
  }

  advanceReveal(): void {
    this.send({ type: "ADVANCE_REVEAL" });
  }

  revealAdvance(): void {
    this.send({ type: "REVEAL_ADVANCE" });
  }

  nextStory(): void {
    this.send({ type: "ADVANCE_REVEAL" });
  }

  endGame(): void {
    this.send({ type: "END_GAME" });
  }

  playAgain(): void {
    this.send({ type: "PLAY_AGAIN" });
  }

  sendTypingStatus(status: "writing" | "idle"): void {
    this.send({ type: "TYPING_STATUS", status });
  }

  // --- Subscriptions ---

  onStateUpdate(callback: StateCallback): () => void {
    this.stateListeners.add(callback);
    // Replay cached state immediately so late subscribers get current data
    if (this.latestRoom) callback(this.latestRoom);
    return () => this.stateListeners.delete(callback);
  }

  onPlayerStatusChanged(callback: StatusCallback): () => void {
    this.statusListeners.add(callback);
    if (this.latestStatuses) callback(this.latestStatuses);
    return () => this.statusListeners.delete(callback);
  }

  onError(callback: ErrorCallback): () => void {
    this.errorListeners.add(callback);
    return () => this.errorListeners.delete(callback);
  }

  onConnectionError(callback: ConnectionErrorCallback): () => void {
    this.connectionErrorListeners.add(callback);
    if (this.connectionError) callback(this.connectionError);
    return () => this.connectionErrorListeners.delete(callback);
  }

  onAdvanceAvailable(callback: AdvanceCallback): () => void {
    this.advanceListeners.add(callback);
    return () => this.advanceListeners.delete(callback);
  }

  onAssembledStories(callback: StoriesCallback): () => void {
    this.storiesListeners.add(callback);
    if (this.latestStories) callback(this.latestStories);
    return () => this.storiesListeners.delete(callback);
  }

  onArchiveReady(callback: ArchiveReadyCallback): () => void {
    this.archiveReadyListeners.add(callback);
    return () => this.archiveReadyListeners.delete(callback);
  }

  onRevealState(callback: RevealStateCallback): () => void {
    this.revealStateListeners.add(callback);
    if (this.latestRevealState) callback(this.latestRevealState);
    return () => this.revealStateListeners.delete(callback);
  }

  onMessageLog(
    callback: (entry: {
      direction: "in" | "out";
      data: string;
      timestamp: number;
    }) => void
  ): () => void {
    this.messageLogListeners.add(callback);
    return () => this.messageLogListeners.delete(callback);
  }

  // --- Getters ---

  getPlayerId(): string | null {
    return this.playerId;
  }

  isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  getRoundStartedAt(): number | null {
    return this.latestRoundStartedAt;
  }

  getRoundDurationMs(): number {
    return this.latestRoundDurationMs;
  }

  getPendingConnected(): number {
    return this.latestPendingConnected;
  }

  getPendingDisconnected(): number {
    return this.latestPendingDisconnected;
  }

  getConnectionError(): ConnectionErrorReason | null {
    return this.connectionError;
  }

  clearConnectionError(): void {
    this.connectionError = null;
  }

  clearStoredPlayerIdForRoom(roomCode: string): void {
    clearStoredPlayerId(roomCode);
  }

  // --- Private ---

  private emitConnectionError(reason: ConnectionErrorReason): void {
    this.connectionError = reason;
    // If the reason is UNKNOWN_PLAYER, clear stored playerId for this room
    if (reason === "UNKNOWN_PLAYER" && this.roomCode) {
      clearStoredPlayerId(this.roomCode);
    }
    for (const cb of this.connectionErrorListeners) cb(reason);
  }

  private send(msg: ClientMessage): void {
    if (!this.socket) return;
    const data = JSON.stringify(msg);

    // Log outgoing message
    for (const listener of this.messageLogListeners) {
      listener({ direction: "out", data, timestamp: Date.now() });
    }

    this.socket.send(data);
  }
}

export const gameClient = new GameClient();
export { GameClient };
