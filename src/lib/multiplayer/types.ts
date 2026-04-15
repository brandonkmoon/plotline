import type { Room, AssembledStory } from "@/lib/game/types";

export type PlayerStatus =
  | "idle"
  | "writing"
  | "submitted"
  | "reconnecting"
  | "disconnected";

export type ClientMessage =
  | { type: "JOIN_ROOM"; playerName: string; playerId?: string }
  | { type: "START_GAME" }
  | {
      type: "SUBMIT_PROMPT";
      storyIndex: number;
      promptIndex: number;
      response: string;
    }
  | { type: "HOST_ADVANCE" }
  | { type: "ADVANCE_REVEAL" }
  | { type: "END_GAME" }
  | { type: "PLAY_AGAIN" }
  | { type: "TYPING_STATUS"; status: "writing" | "idle" };

export type ServerMessage =
  | { type: "STATE_UPDATE"; room: Room; playerId: string }
  | { type: "PLAYER_STATUS_CHANGED"; statuses: Record<string, PlayerStatus> }
  | { type: "ADVANCE_AVAILABLE"; unsubmittedCount: number }
  | { type: "ERROR"; reason: string }
  | { type: "ASSEMBLED_STORIES"; stories: AssembledStory[] }
  | { type: "ARCHIVE_READY"; archiveUrl: string };

export type RegistryMessage =
  | { type: "REGISTER"; code: string }
  | { type: "UNREGISTER"; code: string }
  | { type: "CHECK"; code: string }
  | { type: "GET_ALL" };

export type RegistryResponse =
  | { type: "CHECK_RESULT"; code: string; exists: boolean }
  | { type: "ALL_CODES"; codes: string[] };
