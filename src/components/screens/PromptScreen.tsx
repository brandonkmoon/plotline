"use client";

import { useState, useCallback, useEffect } from "react";
import { useRoom } from "@/lib/client/RoomContext";
import { PROMPTS } from "@/lib/game/prompts";
import BlackletterHeading from "@/components/BlackletterHeading";
import Button from "@/components/Button";
import CountdownTimer from "@/components/CountdownTimer";
import SubmissionStatus from "@/components/SubmissionStatus";

const MAX_CHARS = 120;
const TOTAL_ROUNDS = 7;

export default function PromptScreen() {
  const {
    room,
    currentPlayer,
    submitPrompt,
    sendTypingStatus,
    roundStartedAt,
    roundDurationMs,
  } = useRoom();
  const [response, setResponse] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const currentRound = room?.currentRound ?? 0;
  const prompt = PROMPTS[currentRound];

  // Reset state when round changes
  useEffect(() => {
    setResponse("");
    setSubmitted(false);
  }, [currentRound]);

  // Send typing status
  useEffect(() => {
    if (response.length > 0) {
      sendTypingStatus("writing");
    } else {
      sendTypingStatus("idle");
    }
  }, [response, sendTypingStatus]);

  const handleSubmit = useCallback(() => {
    if (!room || !currentPlayer || !prompt || response.trim().length === 0)
      return;

    // Find the story + prompt index for this player in this round
    const story = room?.stories?.find((s) =>
      s.slots?.some(
        (slot) =>
          slot.promptIndex === currentRound &&
          slot.playerId === currentPlayer.id
      )
    );

    if (!story) return;

    submitPrompt(story.index, currentRound, response.trim());
    setSubmitted(true);
    sendTypingStatus("idle");
  }, [room, currentPlayer, currentRound, prompt, response, submitPrompt, sendTypingStatus]);

  if (!prompt) return null;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6">
      <div
        className="flex flex-col items-center w-full"
        style={{ maxWidth: 420 }}
      >
        {/* Countdown timer */}
        <CountdownTimer
          roundStartedAt={roundStartedAt}
          roundDurationMs={roundDurationMs}
          roomState={room?.state}
        />

        {/* Progress pips */}
        <div className="flex gap-2 mb-6">
          {Array.from({ length: TOTAL_ROUNDS }).map((_, i) => (
            <div
              key={i}
              style={{
                width: 34,
                height: 4,
                borderRadius: 2,
                backgroundColor:
                  i < currentRound
                    ? "#d4a843"
                    : i === currentRound
                    ? "#b8922d"
                    : "#252530",
                opacity: i === currentRound ? 0.6 : 1,
                boxShadow:
                  i < currentRound
                    ? "0 0 8px rgba(212,168,67,0.3)"
                    : "none",
              }}
            />
          ))}
        </div>

        {/* Round eyebrow */}
        <p className="font-sans text-[12px] font-semibold uppercase text-text-muted mb-6"
          style={{ letterSpacing: "4px" }}
        >
          Round {currentRound + 1} of {TOTAL_ROUNDS}
        </p>

        {/* Prompt text */}
        <BlackletterHeading
          size="52px"
          className="text-center anim-prompt-in"
        >
          <span className="gold-text">{prompt.text}</span>
        </BlackletterHeading>

        {/* Textarea */}
        <div className="w-full mt-8">
          <textarea
            value={response}
            onChange={(e) => {
              if (e.target.value.length <= MAX_CHARS) {
                setResponse(e.target.value);
              }
            }}
            disabled={submitted}
            placeholder="Type your response..."
            className="w-full bg-surface border-2 border-border font-serif text-[22px] text-text p-4 resize-none focus:border-gold-dark focus:outline-none transition-colors"
            style={{
              borderRadius: 0,
              minHeight: 120,
              boxShadow: "none",
            }}
            rows={3}
          />
          <div className="flex justify-end mt-1">
            <span
              className={`font-sans text-[13px] ${
                response.length >= MAX_CHARS
                  ? "text-red-400"
                  : "text-text-muted"
              }`}
            >
              {response.length}/{MAX_CHARS}
            </span>
          </div>
        </div>

        {/* Submit button */}
        <div className="w-full mt-4">
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={submitted || response.trim().length === 0}
            className="w-full"
          >
            {submitted ? "Submitted" : "Submit"}
          </Button>
        </div>

        {/* Hint */}
        <p className="mt-4 font-serif italic text-[16px] text-text-dim text-center">
          You can&apos;t see what anyone else wrote.
        </p>

        {/* Submission status */}
        <SubmissionStatus />
      </div>
    </div>
  );
}
