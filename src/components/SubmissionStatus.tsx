"use client";

import { useRoom } from "@/lib/client/RoomContext";

// Compact list of who has submitted this round. Rendered below the prompt
// / waiting screens. Styled as a simple Lora list with thin rules, to
// match the cast list in the lobby.
export default function SubmissionStatus() {
  const { room, playerStatuses } = useRoom();

  if (!room) return null;

  return (
    <ul className="w-full mt-8 list-none">
      {(room?.players ?? []).map((player) => {
        const status = playerStatuses[player.id];
        const submitted = status === "submitted";
        const isReconnecting = status === "reconnecting";
        const isDisconnected = status === "disconnected";

        const dim = isReconnecting
          ? "opacity-50"
          : isDisconnected
          ? "opacity-30"
          : "";

        return (
          <li
            key={player.id}
            className={`font-body text-[15px] py-2 flex justify-between items-center border-b border-list-border last:border-b-0 ${dim}`}
          >
            <span className={isDisconnected ? "line-through" : ""}>
              {player.name}
              {player.isHost && (
                <span className="ml-2 font-sans text-[10px] uppercase tracking-[1px] text-text-muted">
                  Host
                </span>
              )}
              {isReconnecting && (
                <span className="ml-2 font-sans italic text-text-muted text-[12px]">
                  reconnecting
                </span>
              )}
            </span>
            <span
              className={`font-sans text-[13px] ${
                submitted ? "text-ink" : "text-text-muted"
              }`}
            >
              {submitted ? "\u2713" : "\u22EF"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
