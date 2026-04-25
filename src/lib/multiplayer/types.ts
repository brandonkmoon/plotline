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
  | "NAME_TAKEN"
  | "ROOM_FULL";

export type ClientMessage =
  | {
      type: "JOIN_ROOM";
      playerName: string;
      playerId?: string;
      protocolVersion: number;
      previousHostName?: string;
      isPremium?: boolean;
    }
  | { type: "START_GAME"; mode?: "classic" | "competitive"; seriesLength?: 3 | 5 }
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
  | { type: "TYPING_STATUS"; status: "writing" | "idle" }
  // Competitive mode
  | { type: "START_VOTING" }
  | { type: "SUBMIT_VOTE"; storyIndex: number; lineIndex: number; isStandingOvation: boolean }
  | { type: "ADVANCE_VOTING" };

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
  | { type: "ROOM_REDIRECT"; newRoomCode: string }
  // Competitive mode
  | { type: "VOTING_OPEN"; storyIndex: number; votingStartedAt: number; votingDurationMs: number }
  | { type: "VOTING_CLOSED"; storyIndex: number }
  | { type: "GAME_SCORES"; scores: import("@/lib/game/types").GameScores; voteResults: import("@/lib/game/types").StoryVoteResult[]; gameNumber: number; seriesStandings: Record<string, number> }
  | { type: "SERIES_AWARDS"; awards: import("@/lib/game/types").SeriesAward[]; finalStandings: Record<string, number> };

export type RegistryMessage =
  | { type: "REGISTER"; code: string }
  | { type: "UNREGISTER"; code: string }
  | { type: "CHECK"; code: string }
  | { type: "GET_ALL" };

export type RegistryResponse =
  | { type: "CHECK_RESULT"; code: string; exists: boolean }
  | { type: "ALL_CODES"; codes: string[] };
