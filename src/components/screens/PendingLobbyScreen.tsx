"use client";

import { useRoom } from "@/lib/client/RoomContext";
import BlackletterHeading from "@/components/BlackletterHeading";
import GoldBar from "@/components/GoldBar";
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
    <div className="flex flex-col items-center justify-center min-h-screen px-6">
      <div
        className="flex flex-col items-center w-full text-center"
        style={{ maxWidth: 420 }}
      >
        <BlackletterHeading size="56px" className="anim-title-in">
          <span className="gold-text">Game in Progress</span>
        </BlackletterHeading>

        <div
          className="mt-6 anim-fade-in"
          style={{
            opacity: 0,
            animationDelay: "0.2s",
            animationFillMode: "forwards",
          }}
        >
          <GoldBar />
        </div>

        <p
          className="mt-6 font-serif italic text-[18px] text-text-dim anim-fade-in"
          style={{
            opacity: 0,
            animationDelay: "0.3s",
            animationFillMode: "forwards",
          }}
        >
          {activeCount} player{activeCount !== 1 ? "s" : ""} are currently in{" "}
          {phaseLabel}
        </p>

        <div
          className="w-full mt-10 anim-fade-in"
          style={{
            opacity: 0,
            animationDelay: "0.4s",
            animationFillMode: "forwards",
          }}
        >
          <Button
            variant={isReady ? "primary" : "secondary"}
            onClick={() => setReady(!isReady)}
            className="w-full"
          >
            {isReady ? "Ready to Join \u2713" : "Ready to Join"}
          </Button>
        </div>

        <p
          className="mt-6 font-serif italic text-[16px] text-text-muted anim-fade-in"
          style={{
            opacity: 0,
            animationDelay: "0.5s",
            animationFillMode: "forwards",
          }}
        >
          You&apos;ll join automatically when the next game starts.
        </p>
      </div>
    </div>
  );
}
