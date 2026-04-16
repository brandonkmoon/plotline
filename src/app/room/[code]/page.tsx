"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { RoomProvider, useRoom } from "@/lib/client/RoomContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import ConnectionStatus from "@/components/ConnectionStatus";
import LobbyScreen from "@/components/screens/LobbyScreen";
import PromptScreen from "@/components/screens/PromptScreen";
import WaitingScreen from "@/components/screens/WaitingScreen";
import RevealScreen from "@/components/screens/RevealScreen";
import EndScreen from "@/components/screens/EndScreen";
import Button from "@/components/Button";
import { gameClient } from "@/lib/multiplayer/gameClient";

function ConnectionErrorView() {
  const { connectionError } = useRoom();
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = params?.code;

  // Clear stored playerId if the room is no longer available
  useEffect(() => {
    if (connectionError === "UNKNOWN_PLAYER" && code) {
      gameClient.clearStoredPlayerIdForRoom(code);
    }
  }, [connectionError, code]);

  if (!connectionError) return null;

  let title = "";
  let message = "";
  let action: React.ReactNode = null;

  switch (connectionError) {
    case "GAME_IN_PROGRESS":
      title = "Game in progress";
      message = "Rejoining isn't supported yet.";
      action = (
        <Link href="/">
          <Button variant="primary">Back to home</Button>
        </Link>
      );
      break;
    case "UNKNOWN_PLAYER":
      title = "Room unavailable";
      message = "This room is no longer available.";
      action = (
        <Link href="/">
          <Button variant="primary">Back to home</Button>
        </Link>
      );
      break;
    case "PROTOCOL_MISMATCH":
      title = "Update required";
      message = "Please refresh the page.";
      action = (
        <Button
          variant="primary"
          onClick={() => {
            if (typeof window !== "undefined") window.location.reload();
          }}
        >
          Refresh
        </Button>
      );
      break;
    case "CONNECT_TIMEOUT":
      title = "Connection timed out";
      message = "We couldn't reach the game server.";
      action = (
        <Button
          variant="primary"
          onClick={() => {
            if (typeof window !== "undefined") window.location.reload();
          }}
        >
          Retry
        </Button>
      );
      break;
    case "PLAYER_ALREADY_CONNECTED":
      title = "Already connected";
      message =
        "This player is already connected from another tab or device.";
      action = (
        <Link href="/">
          <Button variant="primary">Back to home</Button>
        </Link>
      );
      break;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6">
      <div
        className="flex flex-col items-center w-full text-center"
        style={{ maxWidth: 420 }}
      >
        <h1 className="font-serif text-[32px] gold-text mb-4">{title}</h1>
        <p className="font-serif italic text-[18px] text-text-dim mb-8">
          {message}
        </p>
        {action}
      </div>
    </div>
  );
}

function ConnectingView() {
  const [showTimeout, setShowTimeout] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShowTimeout(true), 10_000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="font-serif italic text-[18px] text-text-dim">
        {showTimeout ? "Still connecting\u2026" : "Connecting\u2026"}
      </p>
    </div>
  );
}

function RoomContent() {
  const { room, currentPlayer, playerStatuses, connectionError } = useRoom();

  if (connectionError) {
    return <ConnectionErrorView />;
  }

  if (!room) {
    return <ConnectingView />;
  }

  switch (room.state) {
    case "LOBBY":
    case "CREATED":
      return <LobbyScreen />;

    case "PLAYING": {
      // Check if current player has submitted for the current round
      const hasSubmitted = currentPlayer
        ? playerStatuses[currentPlayer.id] === "submitted"
        : false;

      if (hasSubmitted) {
        return <WaitingScreen />;
      }
      return <PromptScreen />;
    }

    case "REVEAL":
      return <RevealScreen />;

    case "END":
    case "DESTROYED":
      return <EndScreen />;

    default:
      return (
        <div className="flex items-center justify-center min-h-screen">
          <p className="font-serif italic text-[18px] text-text-dim">
            Unknown state
          </p>
        </div>
      );
  }
}

export default function RoomPage() {
  return (
    <ErrorBoundary>
      <RoomProvider>
        <div className="relative">
          <ConnectionStatus />
          <RoomContent />
        </div>
      </RoomProvider>
    </ErrorBoundary>
  );
}
