import type { Room, AssembledStory } from "@/lib/game/types";

export const PROTOCOL_VERSION = 2;

export type PlayerStatus =
  | "idle"
  | "writing"
  | "submitted"
  | "reconnecting"
  | "disconnected";

export type ConnectionErrorReason =
  | "GAME_IN_PROGRESS"
  | "UNKNOWN_PLAYER"
  | "PROTOCOL_MISMATCH"
  | "CONNECT_TIMEOUT"
  | "PLAYER_ALREADY_CONNECTED"
  | "NAME_TAKEN";

export type ClientMessage =
  | {
      type: "JOIN_ROOM";
      playerName: string;
      playerId?: string;
      protocolVersion: number;
    }
  | { type: "START_GAME" }
  | {
      type: "SUBMIT_PROMPT";
      storyIndex: number;
      promptIndex: number;
      response: string;
    }
  | { type: "HOST_ADVANCE" }
  | { type: "ADVANCE_REVEAL" }
  | { type: "REVEAL_ADVANCE" }
  | { type: "END_GAME" }
  | { type: "PLAY_AGAIN" }
  | { type: "NEW_ROOM" }
  | { type: "QUEUE_NEXT_GAME" }
  | { type: "CREATE_NEXT_ROOM" }
  | { type: "SET_READY"; ready: boolean }
  | { type: "TYPING_STATUS"; status: "writing" | "idle" };

export type ServerMessage =
  | {
      type: "STATE_UPDATE";
      room: Room;
      playerId: string;
      roundStartedAt: number | null;
      roundDurationMs: number;
      pendingConnected: number;
      pendingDisconnected: number;
      protocolVersion: number;
    }
  | { type: "PLAYER_STATUS_CHANGED"; statuses: Record<string, PlayerStatus> }
  | { type: "ADVANCE_AVAILABLE"; unsubmittedCount: number }
  | { type: "ERROR"; reason: string }
  | { type: "ASSEMBLED_STORIES"; stories: AssembledStory[] }
  | { type: "ARCHIVE_READY"; archiveUrl: string }
  | { type: "REVEAL_STATE"; storyIndex: number; revealedCount: number; readerId: string; readerName: string }
  | { type: "ROOM_REDIRECT"; newRoomCode: string };

export type RegistryMessage =
  | { type: "REGISTER"; code: string }
  | { type: "UNREGISTER"; code: string }
  | { type: "CHECK"; code: string }
  | { type: "GET_ALL" };

export type RegistryResponse =
  | { type: "CHECK_RESULT"; code: string; exists: boolean }
  | { type: "ALL_CODES"; codes: string[] };
