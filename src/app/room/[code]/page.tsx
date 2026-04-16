"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { RoomProvider, useRoom } from "@/lib/client/RoomContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import ConnectionStatus from "@/components/ConnectionStatus";
import LobbyScreen from "@/components/screens/LobbyScreen";
import PromptScreen from "@/components/screens/PromptScreen";
import WaitingScreen from "@/components/screens/WaitingScreen";
import RevealScreen from "@/components/screens/RevealScreen";
import EndScreen from "@/components/screens/EndScreen";

function RoomContent() {
  const { room, currentPlayer, playerStatuses } = useRoom();

  if (!room) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="font-serif italic text-[18px] text-text-dim">
          Connecting&hellip;
        </p>
      </div>
    );
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
