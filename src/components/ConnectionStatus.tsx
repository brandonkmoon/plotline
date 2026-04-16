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
    if (currentPlayer) {
      const status = playerStatuses[currentPlayer.id];
      if (status === "reconnecting") return "reconnecting";
    }
    return "disconnected";
  }, [playerStatuses, currentPlayer]);

  // Small, unobtrusive dot in the corner. Colors are restrained (no bright
  // green) to sit politely inside the theater-program aesthetic.
  const color =
    connectionState === "connected"
      ? "#1a1a1a"
      : connectionState === "reconnecting"
      ? "#b45309"
      : "#b91c1c";

  const label =
    connectionState === "connected"
      ? "Connected"
      : connectionState === "reconnecting"
      ? "Reconnecting"
      : "Disconnected";

  return (
    <div
      className={`absolute top-3 right-3 z-50 ${
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
