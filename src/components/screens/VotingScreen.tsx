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
  const [longPressFired, setLongPressFired] = useState(false);

  const storyIndex = votingOpen?.storyIndex ?? room?.votingState?.storyIndex ?? 0;
  const story = assembledStories?.[storyIndex];
  const standingOvationUsed = room?.series?.standingOvationsUsed[currentPlayer?.id ?? ""] ?? false;
  const standingOvationAvailable = !standingOvationUsed;

  // Which lines did I write?
  const myLineIndices = new Set<number>();
  if (room && currentPlayer) {
    const gameStory = room.stories[storyIndex];
    if (gameStory) {
      gameStory.slots.forEach((slot, i) => {
        if (slot.playerId === currentPlayer.id) myLineIndices.add(i);
      });
    }
  }

  // Vote count for live progress
  const votesIn = room?.votingState?.votesReceived?.length ?? 0;
  const totalPlayers = room?.players.filter((p) => p.isConnected).length ?? 0;

  // Reset on new story
  useEffect(() => {
    setSelectedLine(null);
    setIsStandingOvation(false);
    setSubmitted(false);
  }, [storyIndex]);

  // Timer
  useEffect(() => {
    if (!votingOpen?.votingStartedAt) { setRemainingMs(null); return; }
    const duration = votingOpen.votingDurationMs ?? VOTING_DURATION_MS;
    function tick() {
      const left = Math.max(0, votingOpen!.votingStartedAt + duration - Date.now());
      setRemainingMs(left);
    }
    tick();
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [votingOpen]);

  const timerExpired = remainingMs !== null && remainingMs <= 0;
  const allConnectedVoted = votesIn >= totalPlayers && totalPlayers > 0;
  const hostCanAdvance = timerExpired || allConnectedVoted;
  const timerFraction = remainingMs !== null && votingOpen
    ? remainingMs / (votingOpen.votingDurationMs ?? VOTING_DURATION_MS)
    : 1;
  const totalSeconds = remainingMs !== null ? Math.ceil(remainingMs / 1000) : 0;

  const handleTap = useCallback(
    (lineIndex: number) => {
      if (longPressFired) { setLongPressFired(false); return; }
      if (submitted || myLineIndices.has(lineIndex)) return;
      if (selectedLine === lineIndex && !isStandingOvation) {
        setSelectedLine(null);
      } else {
        setSelectedLine(lineIndex);
        setIsStandingOvation(false);
      }
    },
    [submitted, selectedLine, isStandingOvation, myLineIndices, longPressFired]
  );

  const handleLongPressStart = useCallback(
    (lineIndex: number) => {
      if (submitted || myLineIndices.has(lineIndex) || standingOvationUsed) return;
      setLongPressFired(false);
      const timer = setTimeout(() => {
        setLongPressFired(true);
        if (selectedLine === lineIndex && isStandingOvation) {
          setIsStandingOvation(false);
        } else {
          setSelectedLine(lineIndex);
          setIsStandingOvation(true);
        }
      }, 500);
      setLongPressTimer(timer);
    },
    [submitted, selectedLine, isStandingOvation, standingOvationUsed, myLineIndices]
  );

  const handleLongPressEnd = useCallback(() => {
    if (longPressTimer) { clearTimeout(longPressTimer); setLongPressTimer(null); }
  }, [longPressTimer]);

  const handleSubmit = useCallback(() => {
    if (selectedLine === null || submitted) return;
    submitVote(storyIndex, selectedLine, isStandingOvation);
    setSubmitted(true);
  }, [selectedLine, submitted, storyIndex, isStandingOvation, submitVote]);

  if (!story || !room) return null;

  return (
    <div className="screen anim-fade-in">
      {/* Timer bar — shrinks from full to zero, turns red at 5s */}
      <div className="w-full h-[3px] bg-list-border mb-6 overflow-hidden">
        <div
          className="h-full transition-all duration-100 ease-linear"
          style={{
            width: `${timerFraction * 100}%`,
            backgroundColor: totalSeconds <= 5 ? "#dc2626" : totalSeconds <= 10 ? "#d97706" : "#1a1a1a",
          }}
        />
      </div>

      <p className="font-serif font-medium text-[13px] uppercase tracking-[3px] text-text-muted text-center mb-2">
        Vote for the Best Line
      </p>

      {/* Vote progress */}
      <p className="font-sans text-[12px] text-text-muted text-center mb-1">
        {submitted
          ? `${votesIn} of ${totalPlayers} votes in`
          : standingOvationAvailable && !submitted
          ? "Long-press a line for a standing ovation (3× points)"
          : "\u00A0"}
      </p>

      {/* Vote dots */}
      <div className="flex justify-center gap-1.5 mb-4">
        {Array.from({ length: totalPlayers }).map((_, i) => (
          <div
            key={i}
            className="w-2 h-2 rounded-full transition-colors duration-300"
            style={{ backgroundColor: i < votesIn ? "#1a1a1a" : "#d0d0d0" }}
          />
        ))}
      </div>

      <hr className="rule" style={{ marginTop: 0 }} />

      {/* Line cards */}
      <div className="space-y-3">
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
                w-full text-left p-4 border-2 transition-all duration-150
                ${isMine
                  ? "opacity-50 cursor-not-allowed border-list-border"
                  : isOvation
                  ? "border-ink bg-banner shadow-md scale-[1.02]"
                  : isSelected
                  ? "border-ink bg-ink/5 shadow-sm scale-[1.01]"
                  : "border-list-border hover:border-ink/30 hover:bg-ink/[0.02]"
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
                <span className="font-sans text-[10px] uppercase tracking-[1px] text-text-muted mt-1 block">
                  You wrote this
                </span>
              )}
              {isOvation && (
                <span className="font-sans text-[11px] uppercase tracking-[2px] text-ink font-bold mt-2 block">
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
            {selectedLine === null
              ? "Select a Line"
              : isStandingOvation
              ? "★ Submit Standing Ovation"
              : "Submit Vote"}
          </Button>
        ) : (
          <div className="text-center">
            <p className="font-serif font-bold text-[18px] text-ink mb-1">
              Vote Locked In
            </p>
            <p className="font-sans text-[12px] text-text-muted">
              {votesIn} of {totalPlayers} votes in
            </p>
          </div>
        )}
      </div>

      {/* Host advances — tallies votes and moves to next story */}
      {isHost && hostCanAdvance && (
        <div className="mt-4">
          <Button variant="primary" onClick={advanceVoting}>
            Next Story
          </Button>
        </div>
      )}
    </div>
  );
}
