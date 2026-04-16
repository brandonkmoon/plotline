"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRoom } from "@/lib/client/RoomContext";
import { PROMPTS, isNamePickerRound, DESCRIPTOR_PLACEHOLDERS, PLACEHOLDERS } from "@/lib/game/prompts";
import Button from "@/components/Button";
import CountdownTimer from "@/components/CountdownTimer";
import SubmissionStatus from "@/components/SubmissionStatus";
import PendingPlayersBadge from "@/components/PendingPlayersBadge";

const MAX_CHARS = 120;
const TOTAL_ROUNDS = 7;

// Placeholder hints for free-text rounds (rounds 2-6)
const PLACEHOLDER_HINTS: Record<number, string> = {
  2: "A place, real or imagined",
  3: "Something dramatic, stupid, or both",
  4: "A line of dialogue",
  5: "A line of dialogue back",
  6: "Wrap it up — happy, tragic, or weird",
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

  // Name picker state for rounds 0-1
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [descriptor, setDescriptor] = useState("");

  // Remember which name was picked in round 0 so we can dim it in round 1
  const round0PickRef = useRef<string | null>(null);

  const currentRound = room?.currentRound ?? 0;
  const prompt = PROMPTS[currentRound];
  const isNameRound = isNamePickerRound(currentRound);

  // Other players (you can't pick yourself)
  const otherPlayers = room?.players.filter(
    (p) => p.id !== currentPlayer?.id
  ) ?? [];

  // Reset state when the round changes
  useEffect(() => {
    setResponse("");
    setDescriptor("");
    setSelectedName(null);
    setSubmitted(false);
  }, [currentRound]);

  // Save round 0 pick for dimming in round 1
  useEffect(() => {
    if (currentRound === 0 && selectedName && submitted) {
      round0PickRef.current = selectedName;
    }
  }, [currentRound, selectedName, submitted]);

  // Typing status
  useEffect(() => {
    if (isNameRound) {
      sendTypingStatus(descriptor.length > 0 || selectedName ? "writing" : "idle");
    } else {
      sendTypingStatus(response.length > 0 ? "writing" : "idle");
    }
  }, [response, descriptor, selectedName, isNameRound, sendTypingStatus]);

  // Combined value for name-picker rounds
  const combinedValue = selectedName && descriptor.trim()
    ? `${selectedName} — ${descriptor.trim()}`
    : selectedName
    ? selectedName
    : "";

  const effectiveResponse = isNameRound ? combinedValue : response;

  const handleSubmit = useCallback(() => {
    if (!room || !currentPlayer || !prompt || effectiveResponse.trim().length === 0)
      return;

    const story = room?.stories?.find((s) =>
      s.slots?.some(
        (slot) =>
          slot.promptIndex === currentRound &&
          slot.playerId === currentPlayer.id
      )
    );

    if (!story) return;

    submitPrompt(story.index, currentRound, effectiveResponse.trim());
    setSubmitted(true);
    sendTypingStatus("idle");
  }, [
    room,
    currentPlayer,
    currentRound,
    prompt,
    effectiveResponse,
    submitPrompt,
    sendTypingStatus,
  ]);

  if (!prompt) return null;

  // Stable placeholder — pick once per round, don't re-randomize on every render
  const stablePlaceholderRef = useRef<Record<number, string>>({});
  if (!stablePlaceholderRef.current[currentRound]) {
    if (isNameRound) {
      const descs = DESCRIPTOR_PLACEHOLDERS[currentRound];
      stablePlaceholderRef.current[currentRound] = descs
        ? descs[Math.floor(Math.random() * descs.length)]
        : "the mysterious";
    } else {
      const opts = PLACEHOLDERS[currentRound];
      stablePlaceholderRef.current[currentRound] = opts
        ? opts[Math.floor(Math.random() * opts.length)]
        : "Write your answer here";
    }
  }
  const stablePlaceholder = stablePlaceholderRef.current[currentRound];

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

        {isNameRound ? (
          /* ── Name Picker UI (rounds 1-2) ── */
          <div>
            {/* Name buttons */}
            <div className="flex flex-wrap justify-center gap-2 mb-5">
              {otherPlayers.map((player) => {
                const isSelected = selectedName === player.name;
                const isDimmed =
                  currentRound === 1 && round0PickRef.current === player.name;

                return (
                  <button
                    key={player.id}
                    type="button"
                    disabled={submitted || isDimmed}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedName(null);
                      } else {
                        setSelectedName(player.name);
                      }
                    }}
                    className={`
                      font-serif text-[14px] uppercase tracking-[1.5px]
                      px-4 py-2 border-2 transition-colors cursor-pointer
                      disabled:cursor-not-allowed
                      ${
                        isSelected
                          ? "bg-ink text-white border-ink"
                          : isDimmed
                          ? "bg-transparent text-text-muted border-[#d0d0d0] opacity-40"
                          : "bg-transparent text-ink border-ink hover:bg-ink hover:text-white"
                      }
                    `}
                    style={{ borderRadius: 0 }}
                    title={isDimmed ? "Already cast in the previous act" : undefined}
                  >
                    {player.name}
                  </button>
                );
              })}
            </div>

            {/* Descriptor input — appears after a name is tapped */}
            {selectedName && (
              <div className="anim-fade-in">
                <p className="font-body italic text-[13px] text-text-muted text-center mb-2">
                  Who is {selectedName}, really?
                </p>
                <textarea
                  value={descriptor}
                  onChange={(e) => {
                    if (e.target.value.length <= MAX_CHARS - selectedName.length - 3) {
                      setDescriptor(e.target.value);
                    }
                  }}
                  disabled={submitted}
                  placeholder={stablePlaceholder}
                  className="w-full font-body text-[18px] text-ink py-[14px] px-4 border-2 border-input-border focus:border-ink focus:outline-none transition-colors resize-none"
                  style={{ borderRadius: 0, minHeight: 72 }}
                  rows={2}
                />
                <div className="flex justify-between mt-1">
                  <span className="font-sans text-[12px] text-text-muted">
                    {selectedName} — {descriptor || "..."}
                  </span>
                  <span
                    className={`font-sans text-[12px] ${
                      combinedValue.length >= MAX_CHARS
                        ? "text-red-600"
                        : "text-text-muted"
                    }`}
                  >
                    {combinedValue.length}/{MAX_CHARS}
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ── Free Text UI (rounds 3-7) ── */
          <div>
            <textarea
              value={response}
              onChange={(e) => {
                if (e.target.value.length <= MAX_CHARS) {
                  setResponse(e.target.value);
                }
              }}
              disabled={submitted}
              placeholder={
                PLACEHOLDER_HINTS[currentRound] ?? stablePlaceholder
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
          </div>
        )}

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
            disabled={submitted || effectiveResponse.trim().length === 0}
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
