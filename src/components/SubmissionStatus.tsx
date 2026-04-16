"use client";

import { useRoom } from "@/lib/client/RoomContext";

export default function SubmissionStatus() {
  const { room, playerStatuses } = useRoom();

  if (!room) return null;

  return (
    <div className="flex flex-wrap justify-center gap-3 mt-6">
      {(room?.players ?? []).map((player) => {
        const status = playerStatuses[player.id];
        const submitted = status === "submitted";
        const isReconnecting = status === "reconnecting";
        const isDisconnected = status === "disconnected";

        return (
          <div
            key={player.id}
            className={`flex items-center gap-1.5 font-sans text-xs ${
              isReconnecting ? "opacity-50" : ""
            } ${isDisconnected ? "opacity-30" : ""}`}
          >
            <span className={submitted ? "text-gold" : "text-text-muted"}>
              {submitted ? "\u2713" : "\u22EF"}
            </span>
            <span
              className={`${submitted ? "text-text-dim" : "text-text-muted"} ${
                isDisconnected ? "line-through" : ""
              }`}
            >
              {player.name}
              {player.isHost && <span className="text-text-muted text-[10px] ml-1">(Host)</span>}
            </span>
            {isReconnecting && (
              <span className="italic text-text-muted text-[10px]">(reconnecting)</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
