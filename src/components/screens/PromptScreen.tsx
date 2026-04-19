"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRoom } from "@/lib/client/RoomContext";
import { PROMPTS, isNamePickerRound, DESCRIPTOR_PLACEHOLDERS, PLACEHOLDERS } from "@/lib/game/prompts";
import { extractName } from "@/lib/game/normalize";
import Button from "@/components/Button";
import CountdownTimer from "@/components/CountdownTimer";
import SubmissionStatus from "@/components/SubmissionStatus";
import PendingPlayersBadge from "@/components/PendingPlayersBadge";

const MAX_CHARS = 120;
const TOTAL_ROUNDS = 7;

// Placeholder hints for free-text rounds (rounds 2-6).
// These double as tense guides — the examples model the phrasing
// that fits the assembled story template.
const PLACEHOLDER_HINTS: Record<number, string> = {
  2: 'e.g., "at an IKEA at 3am"',
  3: 'e.g., "fighting over the last pretzel"',
  4: 'e.g., "I swear this isn\'t what it looks like."',
  5: 'e.g., "Bold of you to assume I care."',
  6: 'e.g., "they both pretend it never happened"',
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

  // In round 1, find the character already picked in slot 0 of this player's
  // assigned story. Block that name from being picked again so no story ends
  // up with a character talking to themselves.
  const slot0TakenName: string | null = (() => {
    if (currentRound !== 1 || !room || !currentPlayer) return null;
    const assignedStory = room.stories.find((s) =>
      s.slots.some(
        (slot) =>
          slot.promptIndex === 1 && slot.playerId === currentPlayer.id
      )
    );
    const slot0Response = assignedStory?.slots.find(
      (slot) => slot.promptIndex === 0
    )?.response;
    return slot0Response ? extractName(slot0Response) : null;
  })();

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
            {/* Instruction + format preview */}
            <p className="font-body italic text-[14px] text-text-muted text-center mb-3">
              {currentRound === 0
                ? "Tap a name to cast them, then write a short character description."
                : "Tap a different name, then write their character description."}
            </p>
            <p className="font-sans text-[13px] text-center mb-5" style={{ color: "#bbb" }}>
              {selectedName
                ? <>{selectedName} &mdash; {descriptor || <span style={{ fontStyle: "italic" }}>description&hellip;</span>}</>
                : <span style={{ fontStyle: "italic" }}>Name &mdash; a brief, funny description</span>
              }
            </p>

            {/* Name buttons */}
            <div className="flex flex-wrap justify-center gap-2 mb-5">
              {otherPlayers.map((player) => {
                const isSelected = selectedName === player.name;
                // Blocked: this person is already character 1 in this story
                const isBlocked =
                  slot0TakenName !== null &&
                  player.name.toLowerCase() === slot0TakenName.toLowerCase();
                // Dimmed: the player's own round-0 pick (soft discourage)
                const isDimmed =
                  !isBlocked &&
                  currentRound === 1 &&
                  round0PickRef.current === player.name;

                return (
                  <button
                    key={player.id}
                    type="button"
                    disabled={submitted || isBlocked || isDimmed}
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
                          : isBlocked || isDimmed
                          ? "bg-transparent text-text-muted border-[#d0d0d0] opacity-40"
                          : "bg-transparent text-ink border-ink hover:bg-ink hover:text-white"
                      }
                    `}
                    style={{ borderRadius: 0 }}
                    title={
                      isBlocked
                        ? "Already the first character in this story"
                        : isDimmed
                        ? "Already cast in the previous act"
                        : undefined
                    }
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
                  Give {selectedName} a character &mdash; one funny line.
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
                <div className="flex justify-end mt-1">
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
