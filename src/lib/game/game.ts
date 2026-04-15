import type { Room, GameAction, Story, PromptSlot } from "./types";
import { generateAssignments } from "./rotation";
import { getRandomPlaceholder, PROMPTS } from "./prompts";

const MAX_PLAYERS = 12;
const MIN_PLAYERS_TO_START = 4;
const PROMPTS_PER_STORY = 7;

export function gameReducer(state: Room, action: GameAction): Room {
  switch (action.type) {
    case "PLAYER_JOINED":
      return handlePlayerJoined(state, action);
    case "PLAYER_LEFT":
      return handlePlayerLeft(state, action);
    case "GAME_STARTED":
      return handleGameStarted(state, action);
    case "PROMPT_SUBMITTED":
      return handlePromptSubmitted(state, action);
    case "HOST_ADVANCED":
      return handleHostAdvanced(state, action);
    case "REVEAL_STARTED":
      return handleRevealStarted(state, action);
    case "STORY_REVEALED":
      return handleStoryRevealed(state, action);
    case "GAME_ENDED":
      return handleGameEnded(state, action);
    default:
      return state;
  }
}

function handlePlayerJoined(
  state: Room,
  action: Extract<GameAction, { type: "PLAYER_JOINED" }>
): Room {
  if (state.state !== "LOBBY") return state;
  if (state.players.length >= MAX_PLAYERS) return state;
  if (state.players.some((p) => p.id === action.player.id)) return state;

  return {
    ...state,
    players: [...state.players, action.player],
    updatedAt: action.player.joinedAt,
  };
}

function handlePlayerLeft(
  state: Room,
  action: Extract<GameAction, { type: "PLAYER_LEFT" }>
): Room {
  const player = state.players.find((p) => p.id === action.playerId);
  if (!player) return state;

  const remaining = state.players.filter((p) => p.id !== action.playerId);

  if (remaining.length === 0) {
    return { ...state, players: [], state: "DESTROYED", updatedAt: Date.now() };
  }

  // Transfer host if the leaving player was host
  let newHostId = state.hostId;
  let updatedPlayers = remaining;
  if (player.isHost) {
    const newHost = remaining[0];
    newHostId = newHost.id;
    updatedPlayers = remaining.map((p) =>
      p.id === newHost.id ? { ...p, isHost: true } : { ...p, isHost: false }
    );
  }

  return {
    ...state,
    players: updatedPlayers,
    hostId: newHostId,
    updatedAt: Date.now(),
  };
}

function handleGameStarted(
  state: Room,
  action: Extract<GameAction, { type: "GAME_STARTED" }>
): Room {
  if (state.state !== "LOBBY") return state;
  if (action.hostId !== state.hostId) return state;
  if (state.players.length < MIN_PLAYERS_TO_START) return state;

  const playerIds = state.players.map((p) => p.id);
  const assignmentMatrix = generateAssignments(playerIds);

  const stories: Story[] = assignmentMatrix.map((row, storyIndex) => ({
    index: storyIndex,
    slots: row.map(
      (playerId, promptIndex): PromptSlot => ({
        storyIndex,
        promptIndex,
        playerId,
        response: null,
        isPlaceholder: false,
      })
    ),
    isRevealed: false,
  }));

  return {
    ...state,
    state: "PLAYING",
    stories,
    currentRound: 0,
    updatedAt: action.timestamp,
  };
}

function handlePromptSubmitted(
  state: Room,
  action: Extract<GameAction, { type: "PROMPT_SUBMITTED" }>
): Room {
  if (state.state !== "PLAYING") return state;

  const { storyIndex, promptIndex, playerId, response } = action;

  // Validate the submission matches the current round
  if (promptIndex !== state.currentRound) return state;

  // Validate the player is assigned to this slot
  const story = state.stories[storyIndex];
  if (!story) return state;
  const slot = story.slots[promptIndex];
  if (!slot || slot.playerId !== playerId) return state;
  if (slot.response !== null) return state; // already submitted

  // Apply the submission
  const newStories = state.stories.map((s) => {
    if (s.index !== storyIndex) return s;
    return {
      ...s,
      slots: s.slots.map((sl) => {
        if (sl.promptIndex !== promptIndex) return sl;
        return { ...sl, response, isPlaceholder: false };
      }),
    };
  });

  // Check if all prompts for the current round are submitted
  const allSubmitted = newStories.every(
    (s) => s.slots[state.currentRound]?.response !== null
  );

  let newRound = state.currentRound;
  let newState: Room["state"] = state.state;

  if (allSubmitted) {
    if (state.currentRound >= PROMPTS_PER_STORY - 1) {
      newState = "REVEAL";
    } else {
      newRound = state.currentRound + 1;
    }
  }

  return {
    ...state,
    stories: newStories,
    currentRound: newRound,
    state: newState,
    updatedAt: Date.now(),
  };
}

function handleHostAdvanced(
  state: Room,
  action: Extract<GameAction, { type: "HOST_ADVANCED" }>
): Room {
  if (state.state !== "PLAYING") return state;
  if (action.hostId !== state.hostId) return state;

  // Fill placeholders for any missing submissions in the current round
  const newStories = state.stories.map((s) => ({
    ...s,
    slots: s.slots.map((sl) => {
      if (sl.promptIndex !== state.currentRound) return sl;
      if (sl.response !== null) return sl;
      return {
        ...sl,
        response: getRandomPlaceholder(sl.promptIndex),
        isPlaceholder: true,
      };
    }),
  }));

  let newRound = state.currentRound;
  let newRoomState: Room["state"] = state.state;

  if (state.currentRound >= PROMPTS_PER_STORY - 1) {
    newRoomState = "REVEAL";
  } else {
    newRound = state.currentRound + 1;
  }

  return {
    ...state,
    stories: newStories,
    currentRound: newRound,
    state: newRoomState,
    updatedAt: action.timestamp,
  };
}

function handleRevealStarted(
  state: Room,
  action: Extract<GameAction, { type: "REVEAL_STARTED" }>
): Room {
  if (state.state !== "PLAYING") return state;
  if (action.hostId !== state.hostId) return state;
  return { ...state, state: "REVEAL", updatedAt: action.timestamp };
}

function handleStoryRevealed(
  state: Room,
  action: Extract<GameAction, { type: "STORY_REVEALED" }>
): Room {
  if (state.state !== "REVEAL") return state;

  const newStories = state.stories.map((s) =>
    s.index === action.storyIndex ? { ...s, isRevealed: true } : s
  );

  const allRevealed = newStories.every((s) => s.isRevealed);

  return {
    ...state,
    stories: newStories,
    state: allRevealed ? "END" : "REVEAL",
    updatedAt: action.timestamp,
  };
}

function handleGameEnded(
  state: Room,
  action: Extract<GameAction, { type: "GAME_ENDED" }>
): Room {
  return { ...state, state: "END", updatedAt: action.timestamp };
}

export function createRoom(
  code: string,
  host: { id: string; name: string },
  timestamp: number
): Room {
  return {
    code,
    state: "LOBBY",
    players: [
      {
        id: host.id,
        name: host.name,
        isHost: true,
        isConnected: true,
        joinedAt: timestamp,
      },
    ],
    stories: [],
    currentRound: 0,
    hostId: host.id,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
