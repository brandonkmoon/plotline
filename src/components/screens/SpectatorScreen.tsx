"use client";

import { useRoom } from "@/lib/client/RoomContext";
import Button from "@/components/Button";
import CountdownTimer from "@/components/CountdownTimer";
import SubmissionStatus from "@/components/SubmissionStatus";
import PendingPlayersBadge from "@/components/PendingPlayersBadge";

const TOTAL_ROUNDS = 7;

export default function SpectatorScreen() {
  const {
    room,
    currentPendingPlayer,
    setReady,
    roundStartedAt,
    roundDurationMs,
  } = useRoom();

  if (!room) return null;

  const isReady = currentPendingPlayer?.ready ?? false;
  const currentRound = room.currentRound;
  const activeCount = room.players.filter((p) => p.isConnected).length;

  // ── Waiting in lobby (game hasn't started yet) ───────────────
  if (room.state === "LOBBY" || room.state === "CREATED") {
    return (
      <>
        <div className="screen text-center anim-fade-in">
          <p className="font-serif font-medium text-[13px] uppercase tracking-[3px] text-text-muted mb-2">
            Backstage
          </p>
          <h1 className="font-serif font-bold text-[28px] text-ink mb-1">
            Waiting to Start
          </h1>
          <p className="font-body italic text-[16px] text-text-dim">
            {activeCount} player{activeCount !== 1 ? "s" : ""} in the lobby
          </p>

          <hr className="rule" />

          <Button
            variant={isReady ? "primary" : "secondary"}
            onClick={() => setReady(!isReady)}
          >
            {isReady ? "Ready to Join \u2713" : "Ready to Join"}
          </Button>

          <p className="mt-6 font-body italic text-[15px] text-text-muted">
            You&apos;ll join automatically when the game starts.
          </p>
        </div>
        <PendingPlayersBadge />
      </>
    );
  }

  // ── Spectating an active round ───────────────────────────────
  return (
    <>
      <div className="screen anim-fade-in">
        <hr className="rule" />

        <p className="font-serif font-medium text-[13px] uppercase tracking-[3px] text-text-muted text-center mb-2">
          Spectating
        </p>
        <h1 className="font-serif font-bold text-[24px] text-ink text-center mb-1">
          Act {currentRound + 1} of {TOTAL_ROUNDS}
        </h1>
        <p className="font-body italic text-[16px] text-text-dim text-center">
          Watch along &mdash; you&rsquo;ll play next game
        </p>

        <hr className="rule" />

        <div className="mt-4">
          <CountdownTimer
            roundStartedAt={roundStartedAt}
            roundDurationMs={roundDurationMs}
            roomState={room.state}
          />
        </div>

        <SubmissionStatus />

        <div className="mt-8">
          <Button
            variant={isReady ? "primary" : "secondary"}
            onClick={() => setReady(!isReady)}
          >
            {isReady ? "Confirmed for Next Game \u2713" : "Join Next Game"}
          </Button>
          {!isReady && (
            <p className="mt-3 font-body italic text-[13px] text-text-muted text-center">
              Tap to confirm you&rsquo;re in for the next game
            </p>
          )}
        </div>
      </div>
      <PendingPlayersBadge />
    </>
  );
}
