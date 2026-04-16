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
  | { type: "GAME_ENDED"; timestamp: number };
