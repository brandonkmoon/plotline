"use client";

import { useRoom } from "@/lib/client/RoomContext";
import MorphVideo from "@/components/MorphVideo";
import BlackletterHeading from "@/components/BlackletterHeading";
import Button from "@/components/Button";
import CountdownTimer from "@/components/CountdownTimer";
import SubmissionStatus from "@/components/SubmissionStatus";

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
    <div className="flex flex-col items-center justify-center min-h-screen px-6">
      <div
        className="flex flex-col items-center w-full"
        style={{ maxWidth: 420 }}
      >
        {/* Video */}
        <div className="anim-fade-in" style={{ opacity: 0, animationDelay: "0s", animationFillMode: "forwards" }}>
          <MorphVideo size="small" />
        </div>

        {/* Heading */}
        <BlackletterHeading
          size="48px"
          className="mt-6 anim-fade-in"
        >
          <span className="gold-text">Sit Tight</span>
        </BlackletterHeading>

        {/* Subtitle */}
        <p className="mt-4 font-serif italic text-[18px] text-text-dim text-center anim-fade-in"
          style={{ opacity: 0, animationDelay: "0.2s", animationFillMode: "forwards" }}
        >
          Waiting on {totalPending} more player{totalPending !== 1 ? "s" : ""}&hellip;
        </p>

        {/* Timer */}
        <div className="mt-6 anim-fade-in"
          style={{ opacity: 0, animationDelay: "0.3s", animationFillMode: "forwards" }}
        >
          <CountdownTimer
            roundStartedAt={roundStartedAt}
            roundDurationMs={roundDurationMs}
            roomState={room?.state}
          />
        </div>

        {/* Submission status */}
        <SubmissionStatus />

        {/* Host advance button — only shown after the timer has expired,
            and only when there's still someone to wait on. Counts are
            always fresh from the latest STATE_UPDATE. */}
        {isHost && advanceAvailable && totalPending > 0 && (
          <div className="w-full mt-8">
            <Button
              variant="secondary"
              onClick={hostAdvance}
              className="w-full"
            >
              {pendingDisconnected === 0
                ? `Advance Now (${pendingConnected} working)`
                : `Advance Now (${pendingConnected} working, ${pendingDisconnected} offline — all will get placeholders)`}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
