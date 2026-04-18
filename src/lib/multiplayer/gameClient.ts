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
type RoomRedirectCallback = (newRoomCode: string) => void;

const CONNECT_TIMEOUT_MS = 10_000;
const DEFAULT_ROUND_DURATION_MS = 90_000;

// --- sessionStorage helpers ---
// Per-tab identity: each browser tab gets its own playerId so multiple
// tabs in the same browser are treated as distinct players. Refreshing
// a tab keeps the same identity (reconnect).

function devLog(msg: string): void {
  if (process.env.NODE_ENV === "development" && typeof console !== "undefined") {
    console.log(`[client] ${msg}`);
  }
}

function getStoredPlayerId(roomCode: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const id = sessionStorage.getItem(`plotline.playerId.${roomCode}`);
    devLog(`sessionStorage read playerId.${roomCode} → ${id ?? "(none)"}`);
    return id;
  } catch {
    return null;
  }
}

function storePlayerId(roomCode: string, playerId: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(`plotline.playerId.${roomCode}`, playerId);
    devLog(`sessionStorage write playerId.${roomCode} = ${playerId}`);
  } catch {
    // ignore
  }
}

function clearStoredPlayerId(roomCode: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(`plotline.playerId.${roomCode}`);
    devLog(`sessionStorage clear playerId.${roomCode}`);
  } catch {
    // ignore
  }
}

// --- localStorage helpers (rejoin identity) ---
// Persists across tab close / browser restart so a player can resume a
// session after their tab dies. Uses a separate key prefix to avoid
// colliding with the per-tab sessionStorage identity.

function getRejoinId(roomCode: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const id = localStorage.getItem(`plotline.rejoin.${roomCode}`);
    devLog(`localStorage read rejoin.${roomCode} → ${id ?? "(none)"}`);
    return id;
  } catch {
    return null;
  }
}

function clearRejoinId(roomCode: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(`plotline.rejoin.${roomCode}`);
    devLog(`localStorage clear rejoin.${roomCode}`);
  } catch {
    // ignore
  }
}

// --- localStorage helpers (active room for TitleScreen rejoin prompt) ---
// Stores the room code + player name so the home screen can offer a
// one-tap "Rejoin [CODE]" button when a player navigates away mid-game.

const CURRENT_ROOM_KEY = "plotline.currentRoom";
const CURRENT_PLAYER_NAME_KEY = "plotline.currentPlayerName";

function storeCurrentRoomInfo(roomCode: string, playerName: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CURRENT_ROOM_KEY, roomCode);
    localStorage.setItem(CURRENT_PLAYER_NAME_KEY, playerName);
  } catch {
    // ignore
  }
}

function clearCurrentRoomInfo(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(CURRENT_ROOM_KEY);
    localStorage.removeItem(CURRENT_PLAYER_NAME_KEY);
  } catch {
    // ignore
  }
}

export function getCurrentRoomInfo(): { code: string; name: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const code = localStorage.getItem(CURRENT_ROOM_KEY);
    const name = localStorage.getItem(CURRENT_PLAYER_NAME_KEY) ?? "";
    return code ? { code, name } : null;
  } catch {
    return null;
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
  private roomRedirectListeners: Set<RoomRedirectCallback> = new Set();
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

  // beforeunload handler registered while connected. Copies the per-tab
  // sessionStorage playerId into the shared localStorage rejoin slot at
  // the moment the tab is closing. We do NOT write localStorage on every
  // STATE_UPDATE because it is shared across tabs in the same browser —
  // writing eagerly causes the last active tab to overwrite others, which
  // leads to the wrong identity being used when a tab reopens.
  private beforeUnloadHandler: (() => void) | null = null;

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
    //   (clear both sessionStorage AND localStorage entries for this room)
    // - Otherwise: prefer explicit arg, fall back to sessionStorage, then
    //   to localStorage (tab-close recovery)
    let playerIdToSend: string | undefined;
    if (options?.forceNewPlayer) {
      clearStoredPlayerId(roomCode);
      clearRejoinId(roomCode);
      clearCurrentRoomInfo();
      playerIdToSend = undefined;
    } else {
      playerIdToSend =
        existingPlayerId ??
        getStoredPlayerId(roomCode) ??
        getRejoinId(roomCode) ??
        undefined;
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
        // Include playerId in the URL so the server can re-register
        // the player → connection mapping on WebSocket open, before
        // the JOIN_ROOM message is processed. This prevents race
        // conditions where a reconnecting socket closes the previous
        // socket and leaves the player-side map empty.
        query: playerIdToSend ? { playerId: playerIdToSend } : undefined,
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

        if (process.env.NODE_ENV === "development") {
          console.log(`[client] ← ${msg.type}`);
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
            // Persist playerId in sessionStorage (per-tab identity).
            // localStorage is NOT written here — it is shared across tabs
            // in the same browser, so eager writes cause cross-tab
            // contamination. Instead we register a beforeunload handler
            // that copies the per-tab id into localStorage the moment
            // THIS tab is unloading, so reopening the URL can recover it.
            storePlayerId(roomCode, msg.playerId);
            this.registerRejoinOnUnload(roomCode);
            // Store the active room info so TitleScreen can offer a rejoin
            // prompt if the player navigates away mid-game.
            const myName = msg.room.players.find(
              (p) => p.id === msg.playerId
            )?.name ?? "";
            if (myName) storeCurrentRoomInfo(roomCode, myName);
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
              msg.reason === "PLAYER_ALREADY_CONNECTED" ||
              msg.reason === "NAME_TAKEN"
            ) {
              // Clear stored playerId on PLAYER_ALREADY_CONNECTED so a
              // refresh doesn't repeat the conflict. Also clear the
              // localStorage rejoin id so another tab can claim the slot.
              if (msg.reason === "PLAYER_ALREADY_CONNECTED") {
                clearStoredPlayerId(roomCode);
                clearRejoinId(roomCode);
              }
              // UNKNOWN_PLAYER: the player id we used no longer exists
              // on the server — clear both storages so we'll join fresh.
              if (msg.reason === "UNKNOWN_PLAYER") {
                clearStoredPlayerId(roomCode);
                clearRejoinId(roomCode);
                clearCurrentRoomInfo();
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

          case "ROOM_REDIRECT":
            // Clear identity for the old room — we won't be coming back.
            clearStoredPlayerId(roomCode);
            clearRejoinId(roomCode);
            for (const cb of this.roomRedirectListeners) cb(msg.newRoomCode);
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
    this.unregisterRejoinOnUnload();
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

  // --- Rejoin-on-unload listener ---

  // Copy sessionStorage playerId → localStorage at the moment the tab
  // is closing. Because this runs only on the closing tab, each tab's
  // id never overwrites another's — localStorage reflects the identity
  // of whichever tab closed most recently.
  private registerRejoinOnUnload(roomCode: string): void {
    if (
      typeof window === "undefined" ||
      typeof window.addEventListener !== "function"
    ) {
      return;
    }
    if (this.beforeUnloadHandler) return; // already registered

    const handler = () => {
      try {
        const playerId = sessionStorage.getItem(
          `plotline.playerId.${roomCode}`
        );
        if (playerId) {
          localStorage.setItem(`plotline.rejoin.${roomCode}`, playerId);
        }
      } catch {
        // ignore storage errors (quota, privacy mode)
      }
    };

    window.addEventListener("beforeunload", handler);
    // pagehide is more reliable than beforeunload on mobile browsers
    // (iOS Safari in particular). Registering both is idempotent from
    // the handler's perspective — it just writes the same value twice.
    window.addEventListener("pagehide", handler);
    this.beforeUnloadHandler = handler;
  }

  private unregisterRejoinOnUnload(): void {
    if (
      typeof window === "undefined" ||
      typeof window.removeEventListener !== "function"
    ) {
      return;
    }
    if (!this.beforeUnloadHandler) return;
    window.removeEventListener("beforeunload", this.beforeUnloadHandler);
    window.removeEventListener("pagehide", this.beforeUnloadHandler);
    this.beforeUnloadHandler = null;
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

  newRoom(): void {
    this.send({ type: "NEW_ROOM" });
  }

  queueNextGame(): void {
    this.send({ type: "QUEUE_NEXT_GAME" });
  }

  setReady(ready: boolean): void {
    this.send({ type: "SET_READY", ready });
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

  onRoomRedirect(callback: RoomRedirectCallback): () => void {
    this.roomRedirectListeners.add(callback);
    return () => this.roomRedirectListeners.delete(callback);
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
    clearRejoinId(roomCode);
  }

  // --- Private ---

  private emitConnectionError(reason: ConnectionErrorReason): void {
    this.connectionError = reason;
    // If the reason is UNKNOWN_PLAYER, clear BOTH stored identities for
    // this room so the next connect attempt won't retry with the same id.
    if (reason === "UNKNOWN_PLAYER" && this.roomCode) {
      clearStoredPlayerId(this.roomCode);
      clearRejoinId(this.roomCode);
    }
    for (const cb of this.connectionErrorListeners) cb(reason);
  }

  private send(msg: ClientMessage): void {
    if (!this.socket) return;
    const data = JSON.stringify(msg);

    if (process.env.NODE_ENV === "development") {
      console.log(`[client] → ${msg.type}`);
    }

    // Log outgoing message
    for (const listener of this.messageLogListeners) {
      listener({ direction: "out", data, timestamp: Date.now() });
    }

    this.socket.send(data);
  }
}

export const gameClient = new GameClient();
export { GameClient };
