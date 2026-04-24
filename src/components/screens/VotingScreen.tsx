"use client";

import { useState, useEffect, useCallback } from "react";
import { useRoom } from "@/lib/client/RoomContext";
import Button from "@/components/Button";

const VOTING_DURATION_MS = 30_000;

export default function VotingScreen() {
  const {
    room,
    currentPlayer,
    assembledStories,
    votingOpen,
    isHost,
    submitVote,
    advanceVoting,
  } = useRoom();

  const [selectedLine, setSelectedLine] = useState<number | null>(null);
  const [isStandingOvation, setIsStandingOvation] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [longPressTimer, setLongPressTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const storyIndex = votingOpen?.storyIndex ?? 0;
  const story = assembledStories?.[storyIndex];
  const standingOvationUsed = room?.series?.standingOvationsUsed[currentPlayer?.id ?? ""] ?? false;
  const standingOvationAvailable = !standingOvationUsed && !isStandingOvation;

  // Find which lines the current player wrote in this story
  const myLineIndices = new Set<number>();
  if (room && currentPlayer) {
    const gameStory = room.stories[storyIndex];
    if (gameStory) {
      gameStory.slots.forEach((slot, i) => {
        if (slot.playerId === currentPlayer.id) {
          myLineIndices.add(i);
        }
      });
    }
  }

  // Reset when voting opens for a new story
  useEffect(() => {
    setSelectedLine(null);
    setIsStandingOvation(false);
    setSubmitted(false);
  }, [storyIndex]);

  // Countdown timer
  useEffect(() => {
    if (!votingOpen?.votingStartedAt) {
      setRemainingMs(null);
      return;
    }
    const duration = votingOpen.votingDurationMs ?? VOTING_DURATION_MS;
    function tick() {
      const left = Math.max(0, votingOpen!.votingStartedAt + duration - Date.now());
      setRemainingMs(left);
    }
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [votingOpen]);

  const timerExpired = remainingMs !== null && remainingMs <= 0;

  const handleTap = useCallback(
    (lineIndex: number) => {
      if (submitted || myLineIndices.has(lineIndex)) return;
      if (selectedLine === lineIndex && !isStandingOvation) {
        // Deselect
        setSelectedLine(null);
      } else {
        // Select as regular vote (clears any standing ovation)
        setSelectedLine(lineIndex);
        setIsStandingOvation(false);
      }
    },
    [submitted, selectedLine, isStandingOvation, myLineIndices]
  );

  const handleLongPressStart = useCallback(
    (lineIndex: number) => {
      if (submitted || myLineIndices.has(lineIndex) || standingOvationUsed) return;
      const timer = setTimeout(() => {
        if (selectedLine === lineIndex && isStandingOvation) {
          // Downgrade to regular vote
          setIsStandingOvation(false);
        } else {
          // Give standing ovation
          setSelectedLine(lineIndex);
          setIsStandingOvation(true);
        }
      }, 500);
      setLongPressTimer(timer);
    },
    [submitted, selectedLine, isStandingOvation, standingOvationUsed, myLineIndices]
  );

  const handleLongPressEnd = useCallback(() => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  }, [longPressTimer]);

  const handleSubmit = useCallback(() => {
    if (selectedLine === null || submitted) return;
    submitVote(storyIndex, selectedLine, isStandingOvation);
    setSubmitted(true);
  }, [selectedLine, submitted, storyIndex, isStandingOvation, submitVote]);

  if (!story || !room) return null;

  const totalSeconds = remainingMs !== null ? Math.ceil(remainingMs / 1000) : 0;
  const timerDisplay = `0:${String(totalSeconds).padStart(2, "0")}`;

  return (
    <div className="screen anim-fade-in">
      <hr className="rule" />

      <p className="font-serif font-medium text-[13px] uppercase tracking-[3px] text-text-muted text-center mb-2">
        Vote for the Best Line
      </p>

      {/* Timer */}
      <div className="text-center mb-4">
        <p className="font-sans text-[11px] uppercase tracking-[2px] text-text-muted mb-1">
          Time
        </p>
        <p className={`font-serif text-[28px] tracking-[2px] ${totalSeconds <= 10 ? "text-red-600" : "text-ink"}`}>
          {timerDisplay}
        </p>
      </div>

      {/* Standing ovation indicator */}
      {!standingOvationUsed && !submitted && (
        <p className="font-body italic text-[13px] text-text-muted text-center mb-4">
          Long-press a line for a standing ovation (3x points)
        </p>
      )}

      <hr className="rule" />

      {/* Lines */}
      <div className="space-y-2">
        {story.sections.map((section, i) => {
          const isMine = myLineIndices.has(i);
          const isSelected = selectedLine === i;
          const isOvation = isSelected && isStandingOvation;

          return (
            <button
              key={i}
              disabled={submitted || isMine}
              onMouseDown={() => handleLongPressStart(i)}
              onMouseUp={handleLongPressEnd}
              onMouseLeave={handleLongPressEnd}
              onClick={() => handleTap(i)}
              className={`
                w-full text-left px-4 py-3 border-l-2 transition-colors
                ${isMine
                  ? "opacity-30 cursor-not-allowed border-l-list-border"
                  : isOvation
                  ? "bg-banner border-l-ink"
                  : isSelected
                  ? "bg-ink/5 border-l-ink"
                  : "border-l-list-border hover:bg-ink/[0.02]"
                }
              `}
            >
              <p
                className={`font-body text-[17px] leading-[1.6] ${
                  section.style === "dialogue" ? "italic" : ""
                } ${isMine ? "text-text-muted" : "text-ink"}`}
              >
                {section.text}
              </p>
              {isMine && (
                <span className="font-sans text-[10px] uppercase tracking-[1px] text-text-muted">
                  You wrote this
                </span>
              )}
              {isOvation && (
                <span className="font-sans text-[10px] uppercase tracking-[1px] text-ink font-semibold mt-1 block">
                  ★ Standing Ovation
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Submit */}
      <div className="mt-6">
        {!submitted ? (
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={selectedLine === null}
          >
            {selectedLine === null ? "Select a Line" : isStandingOvation ? "Submit Standing Ovation" : "Submit Vote"}
          </Button>
        ) : (
          <p className="font-body italic text-[16px] text-text-muted text-center">
            Vote submitted. Waiting for others...
          </p>
        )}
      </div>

      {/* Host advance (after timer expires) */}
      {isHost && timerExpired && !submitted && (
        <div className="mt-4">
          <Button variant="secondary" onClick={advanceVoting}>
            Close Voting
          </Button>
        </div>
      )}
    </div>
  );
}
