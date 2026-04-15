import PartySocket from "partysocket";
import type { Room, AssembledStory } from "@/lib/game/types";
import type {
  ClientMessage,
  ServerMessage,
  PlayerStatus,
} from "@/lib/multiplayer/types";

type StateCallback = (room: Room) => void;
type StatusCallback = (statuses: Record<string, PlayerStatus>) => void;
type ErrorCallback = (reason: string) => void;
type AdvanceCallback = (count: number) => void;
type StoriesCallback = (stories: AssembledStory[]) => void;
type ArchiveReadyCallback = (archiveUrl: string) => void;

class GameClient {
  private socket: PartySocket | null = null;
  private playerId: string | null = null;
  private stateListeners: Set<StateCallback> = new Set();
  private statusListeners: Set<StatusCallback> = new Set();
  private errorListeners: Set<ErrorCallback> = new Set();
  private advanceListeners: Set<AdvanceCallback> = new Set();
  private storiesListeners: Set<StoriesCallback> = new Set();
  private archiveReadyListeners: Set<ArchiveReadyCallback> = new Set();
  private messageLogListeners: Set<
    (entry: { direction: "in" | "out"; data: string; timestamp: number }) => void
  > = new Set();

  // Cache latest values so new subscribers get the current state immediately
  private latestRoom: Room | null = null;
  private latestStatuses: Record<string, PlayerStatus> | null = null;
  private latestStories: AssembledStory[] | null = null;

  async connect(
    roomCode: string,
    playerName: string,
    existingPlayerId?: string
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let resolved = false;

      this.socket = new PartySocket({
        host: process.env.NEXT_PUBLIC_PARTYKIT_HOST || "localhost:1999",
        room: roomCode,
      });

      this.socket.addEventListener("open", () => {
        const joinMsg: ClientMessage = {
          type: "JOIN_ROOM",
          playerName,
          ...(existingPlayerId ? { playerId: existingPlayerId } : {}),
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
            for (const cb of this.stateListeners) cb(msg.room);
            if (!resolved) {
              resolved = true;
              resolve(msg.playerId);
            }
            break;

          case "PLAYER_STATUS_CHANGED":
            this.latestStatuses = msg.statuses;
            for (const cb of this.statusListeners) cb(msg.statuses);
            break;

          case "ERROR":
            for (const cb of this.errorListeners) cb(msg.reason);
            if (!resolved) {
              resolved = true;
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
        }
      });

      this.socket.addEventListener("error", (err) => {
        if (!resolved) {
          resolved = true;
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
    this.latestRoom = null;
    this.latestStatuses = null;
    this.latestStories = null;
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

  // --- Private ---

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
