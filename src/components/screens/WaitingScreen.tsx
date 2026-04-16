"use client";

import { useRoom } from "@/lib/client/RoomContext";
import Button from "@/components/Button";
import CountdownTimer from "@/components/CountdownTimer";
import SubmissionStatus from "@/components/SubmissionStatus";
import PendingPlayersBadge from "@/components/PendingPlayersBadge";

export default function WaitingScreen() {
  const {
    room,
    isHost,
    advanceAvailable,
    hostAdvance,
    roundStartedAt,
    roundDurationMs,
    pendingConnected,
    pendingDisconnected,
  } = useRoom();

  const totalPending = pendingConnected + pendingDisconnected;

  return (
    <>
      <div className="screen anim-fade-in text-center">
        <hr className="rule" />

        <p className="font-serif font-medium text-[13px] uppercase tracking-[3px] text-text-muted mb-2">
          Intermission
        </p>
        <h1 className="font-serif font-bold text-[24px] text-ink mb-1">
          Sit Tight
        </h1>
        <p className="font-body italic text-[16px] text-text-dim">
          Waiting on {totalPending} more player{totalPending !== 1 ? "s" : ""}
          &hellip;
        </p>

        <hr className="rule" />

        <CountdownTimer
          roundStartedAt={roundStartedAt}
          roundDurationMs={roundDurationMs}
          roomState={room?.state}
        />

        <SubmissionStatus />

        {isHost && advanceAvailable && totalPending > 0 && (
          <div className="mt-8">
            <Button variant="secondary" onClick={hostAdvance}>
              {pendingDisconnected === 0
                ? `Advance Now (${pendingConnected} working)`
                : `Advance (${pendingConnected} working, ${pendingDisconnected} offline)`}
            </Button>
          </div>
        )}
      </div>
      <PendingPlayersBadge />
    </>
  );
}
