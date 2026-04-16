"use client";

import { useState, useCallback, useEffect } from "react";
import { useRoom } from "@/lib/client/RoomContext";
import { PROMPTS } from "@/lib/game/prompts";
import Button from "@/components/Button";
import CountdownTimer from "@/components/CountdownTimer";
import SubmissionStatus from "@/components/SubmissionStatus";
import PendingPlayersBadge from "@/components/PendingPlayersBadge";

const MAX_CHARS = 120;
const TOTAL_ROUNDS = 7;

// Input-hint placeholders per round. Indexed by the round number the
// server sends on STATE_UPDATE.room.currentRound. ASCII-only by design
// (no ellipsis) so they read cleanly across fonts.
const PLACEHOLDER_HINTS: Record<number, string> = {
  0: "Enter a character name",
  1: "Enter another character name",
  2: "Describe a location",
  3: "Describe an action",
  4: "Write a line of dialogue",
  5: "Write a reply",
  6: "Write an ending",
};

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

  useEffect(() => {
    setResponse("");
    setSubmitted(false);
  }, [currentRound]);

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
  }, [
    room,
    currentPlayer,
    currentRound,
    prompt,
    response,
    submitPrompt,
    sendTypingStatus,
  ]);

  if (!prompt) return null;

  return (
    <>
      <div className="screen anim-fade-in">
        <hr className="rule" />

        <p className="font-serif font-medium text-[13px] uppercase tracking-[3px] text-text-muted text-center mb-2">
          Act {currentRound + 1} of {TOTAL_ROUNDS}
        </p>

        <p className="font-body text-[22px] text-ink text-center leading-[1.5] mb-2">
          {prompt.text}
        </p>

        <hr className="rule" />

        <p className="font-body italic text-[14px] text-text-muted text-center mb-7">
          You can&apos;t see what anyone else wrote
        </p>

        <textarea
          value={response}
          onChange={(e) => {
            if (e.target.value.length <= MAX_CHARS) {
              setResponse(e.target.value);
            }
          }}
          disabled={submitted}
          placeholder={
            PLACEHOLDER_HINTS[currentRound] ?? "Write your answer here"
          }
          className="w-full font-body text-[18px] text-ink py-[14px] px-4 border-2 border-input-border focus:border-ink focus:outline-none transition-colors resize-none"
          style={{ borderRadius: 0, minHeight: 96 }}
          rows={3}
        />

        <div className="flex justify-end mt-1">
          <span
            className={`font-sans text-[12px] ${
              response.length >= MAX_CHARS ? "text-red-600" : "text-text-muted"
            }`}
          >
            {response.length}/{MAX_CHARS}
          </span>
        </div>

        <div className="mt-5">
          <CountdownTimer
            roundStartedAt={roundStartedAt}
            roundDurationMs={roundDurationMs}
            roomState={room?.state}
          />
        </div>

        <div className="mt-5">
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={submitted || response.trim().length === 0}
          >
            {submitted ? "Submitted" : "Submit"}
          </Button>
        </div>

        <SubmissionStatus />
      </div>
      <PendingPlayersBadge />
    </>
  );
}
