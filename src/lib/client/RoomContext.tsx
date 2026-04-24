"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { gameClient } from "@/lib/multiplayer/gameClient";
import type { RevealState, VotingOpenState, GameScoresState, SeriesAwardsState } from "@/lib/multiplayer/gameClient";
import type {
  Room,
  Player,
  PendingPlayer,
  AssembledStory,
} from "@/lib/game/types";
import type {
  PlayerStatus,
  ConnectionErrorReason,
} from "@/lib/multiplayer/types";

interface RoomContextValue {
  room: Room | null;
  currentPlayer: Player | null;
  currentPendingPlayer: PendingPlayer | null;
  isPending: boolean;
  playerStatuses: Record<string, PlayerStatus>;
  isHost: boolean;
  justBecameHost: boolean;
  advanceAvailable: boolean;
  unsubmittedCount: number;
  assembledStories: AssembledStory[];
  roundStartedAt: number | null;
  roundDurationMs: number;
  pendingConnected: number;
  pendingDisconnected: number;
  connectionError: ConnectionErrorReason | null;
  clearConnectionError: () => void;
  revealState: RevealState | null;
  roomRedirect: string | null;
  connect: (
    roomCode: string,
    playerName: string,
    existingPlayerId?: string
  ) => Promise<string>;
  disconnect: () => void;
  startGame: (mode?: "classic" | "competitive", seriesLength?: 3 | 5) => void;
  submitPrompt: (
    storyIndex: number,
    promptIndex: number,
    response: string
  ) => void;
  hostAdvance: () => void;
  advanceReveal: () => void;
  revealAdvance: () => void;
  nextStory: () => void;
  endGame: () => void;
  playAgain: () => void;
  newRoom: () => void;
  queueNextGame: () => void;
  createNextRoom: () => void;
  setReady: (ready: boolean) => void;
  sendTypingStatus: (status: "writing" | "idle") => void;
  archiveUrl: string | null;
  // Competitive mode
  votingOpen: VotingOpenState | null;
  gameScores: GameScoresState | null;
  seriesAwards: SeriesAwardsState | null;
  startVoting: () => void;
  submitVote: (storyIndex: number, lineIndex: number, isStandingOvation: boolean) => void;
  advanceVoting: () => void;
}

const RoomContext = createContext<RoomContextValue | null>(null);

const DEFAULT_ROUND_DURATION_MS = 90_000;

export function RoomProvider({ children }: { children: React.ReactNode }) {
  const [room, setRoom] = useState<Room | null>(null);
  const [playerStatuses, setPlayerStatuses] = useState<
    Record<string, PlayerStatus>
  >({});
  const [advanceAvailable, setAdvanceAvailable] = useState(false);
  const [unsubmittedCount, setUnsubmittedCount] = useState(0);
  const [assembledStories, setAssembledStories] = useState<AssembledStory[]>(
    []
  );
  const [roundStartedAt, setRoundStartedAt] = useState<number | null>(null);
  const [roundDurationMs, setRoundDurationMs] = useState<number>(
    DEFAULT_ROUND_DURATION_MS
  );
  const [pendingConnected, setPendingConnected] = useState(0);
  const [pendingDisconnected, setPendingDisconnected] = useState(0);
  const [connectionError, setConnectionError] =
    useState<ConnectionErrorReason | null>(null);
  const [revealState, setRevealState] = useState<RevealState | null>(null);
  const [roomRedirect, setRoomRedirect] = useState<string | null>(null);
  // Competitive mode
  const [votingOpen, setVotingOpen] = useState<VotingOpenState | null>(null);
  const [gameScores, setGameScores] = useState<GameScoresState | null>(null);
  const [seriesAwards, setSeriesAwards] = useState<SeriesAwardsState | null>(null);
  const [justBecameHost, setJustBecameHost] = useState(false);
  const playerIdRef = useRef<string | null>(null);
  const prevIsHostRef = useRef<boolean>(false);

  useEffect(() => {
    const unsubs: (() => void)[] = [];

    // Sync playerId from gameClient — it may have been set before
    // this provider mounted (e.g., TitleScreen called connect directly)
    const existingId = gameClient.getPlayerId();
    if (existingId) {
      playerIdRef.current = existingId;
    }

    unsubs.push(
      gameClient.onStateUpdate((r) => {
        // Also sync playerId on every state update in case it wasn't set yet
        const pid = gameClient.getPlayerId();
        if (pid) playerIdRef.current = pid;
        setRoom(r);
        setRoundStartedAt(gameClient.getRoundStartedAt());
        setRoundDurationMs(gameClient.getRoundDurationMs());
        setPendingConnected(gameClient.getPendingConnected());
        setPendingDisconnected(gameClient.getPendingDisconnected());
        // When round advances (currentRound changes), reset the
        // "advance available" flag since a new round means a new timer
        setAdvanceAvailable((prev) => {
          // We can't easily detect round change here without prior state;
          // the server will re-emit ADVANCE_AVAILABLE after the new timer
          return prev;
        });
      })
    );

    unsubs.push(
      gameClient.onPlayerStatusChanged((statuses) => {
        setPlayerStatuses(statuses);
      })
    );

    unsubs.push(
      gameClient.onAdvanceAvailable((count) => {
        setAdvanceAvailable(true);
        setUnsubmittedCount(count);
      })
    );

    unsubs.push(
      gameClient.onAssembledStories((stories) => {
        setAssembledStories(stories);
      })
    );

    unsubs.push(
      gameClient.onRevealState((state) => {
        setRevealState(state);
      })
    );

    unsubs.push(
      gameClient.onConnectionError((reason) => {
        setConnectionError(reason);
      })
    );

    unsubs.push(
      gameClient.onRoomRedirect((newCode) => {
        setRoomRedirect(newCode);
      })
    );

    // Competitive mode listeners
    unsubs.push(
      gameClient.onVotingOpen((state) => setVotingOpen(state))
    );
    unsubs.push(
      gameClient.onVotingClosed(() => {
        // Don't clear votingOpen — the VotingScreen stays visible
        // in a "closed" state with a "Next Story" button for the host.
        // It clears when the host advances and votingState is removed
        // from the room via STATE_UPDATE.
      })
    );
    unsubs.push(
      gameClient.onGameScores((state) => setGameScores(state))
    );
    unsubs.push(
      gameClient.onSeriesAwards((state) => setSeriesAwards(state))
    );

    return () => {
      unsubs.forEach((fn) => fn());
      gameClient.disconnect();
    };
  }, []);

  // Detect host transfer: when this client's isHost flips false → true,
  // show a brief "you're now the host" notice for 4 seconds.
  const currentPlayer =
    room?.players.find((p) => p.id === playerIdRef.current) ?? null;
  const isHost = currentPlayer?.isHost ?? false;

  useEffect(() => {
    if (isHost && !prevIsHostRef.current) {
      setJustBecameHost(true);
      const t = setTimeout(() => setJustBecameHost(false), 4000);
      return () => clearTimeout(t);
    }
    prevIsHostRef.current = isHost;
  }, [isHost]);

  // Reset advanceAvailable whenever the currentRound changes — new round,
  // new timer, so the "advance" window is fresh.
  const prevRoundRef = useRef<number | null>(null);
  useEffect(() => {
    if (!room) {
      prevRoundRef.current = null;
      return;
    }
    if (prevRoundRef.current !== room.currentRound) {
      if (prevRoundRef.current !== null) {
        setAdvanceAvailable(false);
      }
      prevRoundRef.current = room.currentRound;
    }
  }, [room]);

  const connect = useCallback(
    async (
      roomCode: string,
      playerName: string,
      existingPlayerId?: string
    ) => {
      const id = await gameClient.connect(
        roomCode,
        playerName,
        existingPlayerId
      );
      playerIdRef.current = id;
      return id;
    },
    []
  );

  const disconnect = useCallback(() => {
    gameClient.disconnect();
    playerIdRef.current = null;
    setRoom(null);
    setPlayerStatuses({});
    setAdvanceAvailable(false);
    setUnsubmittedCount(0);
    setAssembledStories([]);
    setRoundStartedAt(null);
    setRoundDurationMs(DEFAULT_ROUND_DURATION_MS);
    setPendingConnected(0);
    setPendingDisconnected(0);
    setConnectionError(null);
    setRevealState(null);
    setRoomRedirect(null);
  }, []);

  const clearConnectionError = useCallback(() => {
    gameClient.clearConnectionError();
    setConnectionError(null);
  }, []);

  const currentPendingPlayer =
    room?.pendingPlayers?.find((p) => p.id === playerIdRef.current) ?? null;
  const isPending = currentPendingPlayer !== null;

  const value: RoomContextValue = {
    room,
    currentPlayer,
    currentPendingPlayer,
    isPending,
    playerStatuses,
    isHost,
    justBecameHost,
    advanceAvailable,
    unsubmittedCount,
    assembledStories,
    roundStartedAt,
    roundDurationMs,
    pendingConnected,
    pendingDisconnected,
    connectionError,
    clearConnectionError,
    revealState,
    roomRedirect,
    connect,
    disconnect,
    startGame: (mode, seriesLength) => gameClient.startGame(mode, seriesLength),
    submitPrompt: (storyIndex, promptIndex, response) =>
      gameClient.submitPrompt(storyIndex, promptIndex, response),
    hostAdvance: () => gameClient.hostAdvance(),
    advanceReveal: () => gameClient.advanceReveal(),
    revealAdvance: () => gameClient.revealAdvance(),
    nextStory: () => gameClient.nextStory(),
    endGame: () => gameClient.endGame(),
    playAgain: () => gameClient.playAgain(),
    newRoom: () => gameClient.newRoom(),
    queueNextGame: () => gameClient.queueNextGame(),
    createNextRoom: () => gameClient.createNextRoom(),
    setReady: (ready) => gameClient.setReady(ready),
    sendTypingStatus: (status) => gameClient.sendTypingStatus(status),
    archiveUrl: room?.archiveUrl ?? null,
    // Competitive mode
    votingOpen,
    gameScores,
    seriesAwards,
    startVoting: () => gameClient.startVoting(),
    submitVote: (storyIndex, lineIndex, isStandingOvation) =>
      gameClient.submitVote(storyIndex, lineIndex, isStandingOvation),
    advanceVoting: () => gameClient.advanceVoting(),
  };

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

export function useRoom(): RoomContextValue {
  const ctx = useContext(RoomContext);
  if (!ctx) {
    throw new Error("useRoom must be used within a RoomProvider");
  }
  return ctx;
}
