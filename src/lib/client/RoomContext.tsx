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
import type { Room, Player, AssembledStory } from "@/lib/game/types";
import type { PlayerStatus } from "@/lib/multiplayer/types";

interface RoomContextValue {
  room: Room | null;
  currentPlayer: Player | null;
  playerStatuses: Record<string, PlayerStatus>;
  isHost: boolean;
  advanceAvailable: boolean;
  unsubmittedCount: number;
  assembledStories: AssembledStory[];
  connect: (
    roomCode: string,
    playerName: string,
    existingPlayerId?: string
  ) => Promise<string>;
  disconnect: () => void;
  startGame: () => void;
  submitPrompt: (
    storyIndex: number,
    promptIndex: number,
    response: string
  ) => void;
  hostAdvance: () => void;
  advanceReveal: () => void;
  endGame: () => void;
  playAgain: () => void;
  sendTypingStatus: (status: "writing" | "idle") => void;
  archiveUrl: string | null;
}

const RoomContext = createContext<RoomContextValue | null>(null);

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
  const [archiveUrl, setArchiveUrl] = useState<string | null>(null);
  const playerIdRef = useRef<string | null>(null);

  useEffect(() => {
    const unsubs: (() => void)[] = [];

    unsubs.push(
      gameClient.onStateUpdate((r) => {
        setRoom(r);
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
      gameClient.onArchiveReady((url) => {
        setArchiveUrl(url);
      })
    );

    return () => {
      unsubs.forEach((fn) => fn());
      gameClient.disconnect();
    };
  }, []);

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
    setArchiveUrl(null);
  }, []);

  const currentPlayer =
    room?.players.find((p) => p.id === playerIdRef.current) ?? null;
  const isHost = currentPlayer?.isHost ?? false;

  const value: RoomContextValue = {
    room,
    currentPlayer,
    playerStatuses,
    isHost,
    advanceAvailable,
    unsubmittedCount,
    assembledStories,
    connect,
    disconnect,
    startGame: () => gameClient.startGame(),
    submitPrompt: (storyIndex, promptIndex, response) =>
      gameClient.submitPrompt(storyIndex, promptIndex, response),
    hostAdvance: () => gameClient.hostAdvance(),
    advanceReveal: () => gameClient.advanceReveal(),
    endGame: () => gameClient.endGame(),
    playAgain: () => gameClient.playAgain(),
    sendTypingStatus: (status) => gameClient.sendTypingStatus(status),
    archiveUrl,
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
