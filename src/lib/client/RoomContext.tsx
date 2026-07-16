"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
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
  startGame: (mode?: "classic" | "competitive", seriesLength?: 1 | 2 | 3 | 4 | 5) => void;
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
        // The advanceAvailable flag is reset on round change by a dedicated
        // effect below; the server re-emits ADVANCE_AVAILABLE per round.
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
      gameClient.onVotingClosed(() => setVotingOpen(null))
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
  // eslint-disable-next-line react-hooks/refs -- playerIdRef only changes alongside a state update (re-render), so this render-time read stays consistent; moving it to state would churn the identity effects.
  const currentPlayer = room?.players.find((p) => p.id === playerIdRef.current) ?? null;
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

  // eslint-disable-next-line react-hooks/refs -- see note above: ref changes pair with a state update, so the render-time read is consistent.
  const currentPendingPlayer = room?.pendingPlayers?.find((p) => p.id === playerIdRef.current) ?? null;
  const isPending = currentPendingPlayer !== null;

  // Stable delegate functions — each just forwards to the gameClient
  // singleton, so they never need to change identity between renders.
  const startGame = useCallback<RoomContextValue["startGame"]>(
    (mode, seriesLength) => gameClient.startGame(mode, seriesLength),
    []
  );
  const submitPrompt = useCallback<RoomContextValue["submitPrompt"]>(
    (storyIndex, promptIndex, response) =>
      gameClient.submitPrompt(storyIndex, promptIndex, response),
    []
  );
  const hostAdvance = useCallback(() => gameClient.hostAdvance(), []);
  const advanceReveal = useCallback(() => gameClient.advanceReveal(), []);
  const revealAdvance = useCallback(() => gameClient.revealAdvance(), []);
  const nextStory = useCallback(() => gameClient.nextStory(), []);
  const endGame = useCallback(() => gameClient.endGame(), []);
  const playAgain = useCallback(() => gameClient.playAgain(), []);
  const newRoom = useCallback(() => gameClient.newRoom(), []);
  const queueNextGame = useCallback(() => gameClient.queueNextGame(), []);
  const createNextRoom = useCallback(() => gameClient.createNextRoom(), []);
  const setReady = useCallback<RoomContextValue["setReady"]>(
    (ready) => gameClient.setReady(ready),
    []
  );
  const sendTypingStatus = useCallback<RoomContextValue["sendTypingStatus"]>(
    (status) => gameClient.sendTypingStatus(status),
    []
  );
  const startVoting = useCallback(() => gameClient.startVoting(), []);
  const submitVote = useCallback<RoomContextValue["submitVote"]>(
    (storyIndex, lineIndex, isStandingOvation) =>
      gameClient.submitVote(storyIndex, lineIndex, isStandingOvation),
    []
  );
  const advanceVoting = useCallback(() => gameClient.advanceVoting(), []);

  const archiveUrl = room?.archiveUrl ?? null;

  const value = useMemo<RoomContextValue>(
    () => ({
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
      startGame,
      submitPrompt,
      hostAdvance,
      advanceReveal,
      revealAdvance,
      nextStory,
      endGame,
      playAgain,
      newRoom,
      queueNextGame,
      createNextRoom,
      setReady,
      sendTypingStatus,
      archiveUrl,
      // Competitive mode
      votingOpen,
      gameScores,
      seriesAwards,
      startVoting,
      submitVote,
      advanceVoting,
    }),
    [
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
      startGame,
      submitPrompt,
      hostAdvance,
      advanceReveal,
      revealAdvance,
      nextStory,
      endGame,
      playAgain,
      newRoom,
      queueNextGame,
      createNextRoom,
      setReady,
      sendTypingStatus,
      archiveUrl,
      votingOpen,
      gameScores,
      seriesAwards,
      startVoting,
      submitVote,
      advanceVoting,
    ]
  );

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

export function useRoom(): RoomContextValue {
  const ctx = useContext(RoomContext);
  if (!ctx) {
    throw new Error("useRoom must be used within a RoomProvider");
  }
  return ctx;
}
