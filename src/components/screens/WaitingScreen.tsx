"use client";

import { useRoom } from "@/lib/client/RoomContext";
import MorphVideo from "@/components/MorphVideo";
import BlackletterHeading from "@/components/BlackletterHeading";
import Button from "@/components/Button";
import CountdownTimer from "@/components/CountdownTimer";
import SubmissionStatus from "@/components/SubmissionStatus";

export default function WaitingScreen() {
  const { room, isHost, advanceAvailable, unsubmittedCount, hostAdvance, roundStartedAt } =
    useRoom();

  const waitingCount = unsubmittedCount;

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
          Waiting on {waitingCount || "a few"} more player{waitingCount !== 1 ? "s" : ""}&hellip;
        </p>

        {/* Timer */}
        <div className="mt-6 anim-fade-in"
          style={{ opacity: 0, animationDelay: "0.3s", animationFillMode: "forwards" }}
        >
          <CountdownTimer roundStartedAt={roundStartedAt} />
        </div>

        {/* Submission status */}
        <SubmissionStatus />

        {/* Host advance button */}
        {isHost && advanceAvailable && (
          <div className="w-full mt-8">
            <Button
              variant="secondary"
              onClick={hostAdvance}
              className="w-full"
            >
              Advance Now ({unsubmittedCount} player{unsubmittedCount !== 1 ? "s" : ""} will get placeholder prompts)
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
