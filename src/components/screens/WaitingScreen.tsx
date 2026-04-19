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
    justBecameHost,
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
        {justBecameHost && (
          <p className="font-sans text-[12px] uppercase tracking-[2px] text-white bg-ink px-4 py-2 text-center mb-4">
            You&rsquo;re now the host
          </p>
        )}

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

        {isHost && (advanceAvailable || pendingConnected === 0) && totalPending > 0 && (
          <div className="mt-8">
            <Button variant="secondary" onClick={hostAdvance}>
              {pendingConnected === 0
                ? `Advance (${pendingDisconnected} offline)`
                : pendingDisconnected === 0
                ? `Advance Now (${pendingConnected} still writing)`
                : `Advance (${pendingConnected} still writing, ${pendingDisconnected} offline)`}
            </Button>
          </div>
        )}
      </div>
      <PendingPlayersBadge />
    </>
  );
}
