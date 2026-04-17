export type RoomState =
  | "CREATED"
  | "LOBBY"
  | "PLAYING"
  | "REVEAL"
  | "END"
  | "DESTROYED";

export interface Player {
  id: string;
  name: string;
  isHost: boolean;
  isConnected: boolean;
  joinedAt: number;
  queuedForNextGame?: boolean;
}

export interface PendingPlayer {
  id: string;
  name: string;
  joinedAt: number;
  ready: boolean;
}

export interface PromptSlot {
  storyIndex: number;
  promptIndex: number;
  playerId: string | null;
  response: string | null;
  isPlaceholder: boolean;
}

export interface Story {
  index: number;
  slots: PromptSlot[];
  isRevealed: boolean;
}

export interface Room {
  code: string;
  state: RoomState;
  players: Player[];
  stories: Story[];
  currentRound: number;
  hostId: string;
  createdAt: number;
  updatedAt: number;
  pendingPlayers: PendingPlayer[];
}

export interface Prompt {
  index: number;
  text: string;
}

export interface NarrativeSection {
  text: string;
  style: 'name' | 'location' | 'action' | 'dialogue' | 'ending';
  speakerName?: string;
}

export interface AssembledStory {
  storyIndex: number;
  title: string;
  sections: NarrativeSection[];
  readerName: string;
  responses: string[];
  prompts: string[];
}

export type GameAction =
  | { type: "PLAYER_JOINED"; player: Player }
  | { type: "PLAYER_LEFT"; playerId: string }
  | { type: "GAME_STARTED"; hostId: string; timestamp: number }
  | {
      type: "PROMPT_SUBMITTED";
      playerId: string;
      storyIndex: number;
      promptIndex: number;
      response: string;
    }
  | { type: "HOST_ADVANCED"; hostId: string; timestamp: number }
  | { type: "REVEAL_STARTED"; hostId: string; timestamp: number }
  | { type: "STORY_REVEALED"; storyIndex: number; timestamp: number }
  | { type: "GAME_ENDED"; timestamp: number }
  | { type: "PENDING_PLAYER_JOINED"; player: PendingPlayer }
  | { type: "PENDING_PLAYER_LEFT"; playerId: string }
  | { type: "PENDING_PLAYER_READY_CHANGED"; playerId: string; ready: boolean }
  | { type: "PENDING_PROMOTED"; playerIds: string[]; timestamp: number }
  | { type: "PLAYER_QUEUED_NEXT"; playerId: string };
