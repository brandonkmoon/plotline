"use client";

import { useMemo } from "react";
import { useRoom } from "@/lib/client/RoomContext";
import { gameClient } from "@/lib/multiplayer/gameClient";

type ConnectionState = "connected" | "reconnecting" | "disconnected";

export default function ConnectionStatus() {
  const { playerStatuses, currentPlayer } = useRoom();

  const connectionState: ConnectionState = useMemo(() => {
    if (gameClient.isConnected()) {
      if (currentPlayer) {
        const status = playerStatuses[currentPlayer.id];
        if (status === "reconnecting") return "reconnecting";
        if (status === "disconnected") return "disconnected";
      }
      return "connected";
    }
    // Socket not open — check if we were previously connected
    if (currentPlayer) {
      const status = playerStatuses[currentPlayer.id];
      if (status === "reconnecting") return "reconnecting";
    }
    return "disconnected";
  }, [playerStatuses, currentPlayer]);

  const color =
    connectionState === "connected"
      ? "#4ade80"
      : connectionState === "reconnecting"
      ? "#f59e0b"
      : "#ef4444";

  const label =
    connectionState === "connected"
      ? "Connected"
      : connectionState === "reconnecting"
      ? "Reconnecting"
      : "Disconnected";

  return (
    <div
      className={`absolute top-4 right-4 z-50 ${
        connectionState === "reconnecting" ? "connection-pulse" : ""
      }`}
      title={label}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: color,
        }}
      />
    </div>
  );
}
