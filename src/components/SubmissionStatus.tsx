"use client";

import { useRoom } from "@/lib/client/RoomContext";

export default function SubmissionStatus() {
  const { room, playerStatuses } = useRoom();

  if (!room) return null;

  return (
    <div className="flex flex-wrap justify-center gap-3 mt-6">
      {room.players
        .filter((p) => p.isConnected)
        .map((player) => {
          const status = playerStatuses[player.id];
          const submitted = status === "submitted";
          return (
            <div
              key={player.id}
              className="flex items-center gap-1.5 font-sans text-xs"
            >
              <span className={submitted ? "text-gold" : "text-text-muted"}>
                {submitted ? "\u2713" : "\u22EF"}
              </span>
              <span className={submitted ? "text-text-dim" : "text-text-muted"}>
                {player.name}
              </span>
            </div>
          );
        })}
    </div>
  );
}
