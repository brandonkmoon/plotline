"use client";

import { useRoom } from "@/lib/client/RoomContext";

/**
 * A small footer strip shown in-game when there are pending players
 * (i.e., late joiners waiting in the lobby).
 *
 * Only renders when there's at least one pending player.
 */
export default function PendingPlayersBadge() {
  const { room } = useRoom();
  const pending = room?.pendingPlayers ?? [];
  if (pending.length === 0) return null;

  const parts = pending.map(
    (p) => `${p.name} ${p.ready ? "✓" : "···"}`
  );

  return (
    <div
      className="fixed bottom-0 left-0 right-0 py-2 px-4 text-center pointer-events-none border-t border-ink"
      style={{ backgroundColor: "#ffffff" }}
    >
      <p className="font-sans text-[11px] uppercase tracking-[3px] text-text-muted">
        Watching: {parts.join(", ")}
      </p>
    </div>
  );
}
