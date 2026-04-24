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

// --- Competitive mode types ---

export type GameMode = "classic" | "competitive";

export interface Vote {
  voterId: string;
  storyIndex: number;
  lineIndex: number; // which of the 7 lines (0-6)
  isStandingOvation: boolean;
}

export interface StoryVoteResult {
  storyIndex: number;
  votes: Vote[];
  winningLineIndex: number;  // line with most votes
  winningAuthorId: string;
  winningLineText: string;
  // Snapshot data so awards can reference past games without needing
  // the original stories array (which gets reset between games).
  lineAuthors: Record<number, string>;
  lineTexts: Record<number, string>;
}

export interface GameScores {
  // playerId → points earned this game
  points: Record<string, number>;
  lineOfTheGame: {
    storyIndex: number;
    lineIndex: number;
    text: string;
    authorId: string;
    authorName: string;
    voteCount: number;
  } | null;
}

export interface SeriesAward {
  id: string;       // "mvp", "scene-stealer", etc.
  title: string;    // "MVP", "Scene Stealer", etc.
  playerId: string;
  playerName: string;
  detail?: string;  // e.g. the winning line text for "Line of the Series"
}

export interface SeriesState {
  mode: GameMode;
  totalGames: number;           // 3 or 5
  currentGameNumber: number;    // 1-indexed
  cumulativePoints: Record<string, number>;
  // Track standing ovation usage per game per player
  standingOvationsUsed: Record<string, boolean>;
  // Stored results from each completed game
  completedGames: {
    gameNumber: number;
    scores: GameScores;
    voteResults: StoryVoteResult[];
  }[];
  // Awards (populated after final game)
  awards: SeriesAward[];
}

// --- Voting sub-state within REVEAL ---

export type VotingPhase = "reading" | "voting" | "closed";

export interface VotingState {
  storyIndex: number;
  phase: VotingPhase;
  votesReceived: string[];   // playerIds who have submitted votes
  votingStartedAt: number | null;
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
  nextRoomCode?: string;
  archiveUrl?: string;
  // Competitive mode (defaults to "classic" if absent)
  gameMode?: GameMode;
  series?: SeriesState;
  votingState?: VotingState;
  // Shuffled story reveal order — set when entering REVEAL phase.
  revealOrder?: number[];
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
  | { type: "PLAYER_QUEUED_NEXT"; playerId: string }
  | { type: "NEXT_ROOM_CREATED"; nextRoomCode: string }
  | { type: "ARCHIVE_URL_SET"; archiveUrl: string }
  // Competitive mode actions
  | { type: "VOTING_STARTED"; storyIndex: number; timestamp: number }
  | { type: "VOTE_SUBMITTED"; vote: Vote }
  | { type: "VOTING_CLOSED"; storyIndex: number }
  | { type: "SERIES_STARTED"; totalGames: number };
