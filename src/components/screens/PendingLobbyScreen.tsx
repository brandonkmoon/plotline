"use client";

import { useRoom } from "@/lib/client/RoomContext";
import Button from "@/components/Button";

function describePhase(state: string | undefined, currentRound: number): string {
  switch (state) {
    case "PLAYING":
      return `Round ${currentRound + 1} of 7`;
    case "REVEAL":
      return "Revealing stories";
    case "END":
      return "Wrapping up";
    case "LOBBY":
    case "CREATED":
      return "Waiting to start";
    default:
      return "Waiting";
  }
}

export default function PendingLobbyScreen() {
  const { room, currentPendingPlayer, setReady } = useRoom();
  if (!room) return null;

  const activeCount = room.players.filter((p) => p.isConnected).length;
  const phaseLabel = describePhase(room.state, room.currentRound);
  const isReady = currentPendingPlayer?.ready ?? false;

  return (
    <div className="screen text-center anim-fade-in">
      <p className="font-serif font-medium text-[13px] uppercase tracking-[3px] text-text-muted mb-2">
        Backstage
      </p>
      <h1 className="font-serif font-bold text-[28px] text-ink mb-1">
        Game in Progress
      </h1>
      <p className="font-body italic text-[16px] text-text-dim">
        {activeCount} player{activeCount !== 1 ? "s" : ""}{" "}
        {activeCount === 1 ? "is" : "are"} currently in {phaseLabel}
      </p>

      <hr className="rule" />

      <Button
        variant={isReady ? "primary" : "secondary"}
        onClick={() => setReady(!isReady)}
      >
        {isReady ? "Ready to Join \u2713" : "Ready to Join"}
      </Button>

      <p className="mt-6 font-body italic text-[15px] text-text-muted">
        You&apos;ll join automatically when the next game starts.
      </p>
    </div>
  );
}
