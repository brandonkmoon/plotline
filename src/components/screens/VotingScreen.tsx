"use client";

import { useState, useEffect, useCallback } from "react";
import { useRoom } from "@/lib/client/RoomContext";
import Button from "@/components/Button";

const VOTING_DURATION_MS = 30_000;

export default function VotingScreen() {
  const {
    room,
    currentPlayer,
    currentPendingPlayer,
    assembledStories,
    votingOpen,
    isHost,
    submitVote,
    advanceVoting,
  } = useRoom();

  const isSpectator = currentPendingPlayer !== null;

  const [selectedLine, setSelectedLine] = useState<number | null>(null);
  const [isStandingOvation, setIsStandingOvation] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [longPressTimer, setLongPressTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [longPressFired, setLongPressFired] = useState(false);
  const [pressingLine, setPressingLine] = useState<number | null>(null);
  const [hintDismissed, setHintDismissed] = useState(false);

  const storyIndex = votingOpen?.storyIndex ?? room?.votingState?.storyIndex ?? 0;
  const story = assembledStories?.[storyIndex];
  const standingOvationUsed = room?.series?.standingOvationsUsed[currentPlayer?.id ?? ""] ?? false;
  const standingOvationAvailable = !standingOvationUsed;
  const isFirstVoteOfSeries = (room?.series?.currentGameNumber ?? 1) === 1 &&
    (room?.series?.completedGames?.length ?? 0) === 0 &&
    (room?.stories?.filter((s) => s.isRevealed).length ?? 0) === 0;
  const showFirstTimeHint = isFirstVoteOfSeries && !hintDismissed;

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
      if (longPressTimer) return; // prevent double-fire from touch + mouse
      setPressingLine(lineIndex);
      setLongPressFired(false);
      const timer = setTimeout(() => {
        setLongPressFired(true);
        setPressingLine(null);
        if (selectedLine === lineIndex && isStandingOvation) {
          setIsStandingOvation(false);
        } else {
          setSelectedLine(lineIndex);
          setIsStandingOvation(true);
        }
      }, 500);
      setLongPressTimer(timer);
    },
    [submitted, selectedLine, isStandingOvation, standingOvationUsed, myLineIndices, longPressTimer]
  );

  const handleLongPressEnd = useCallback(() => {
    setPressingLine(null);
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
      {/* First-time hint */}
      {showFirstTimeHint && (
        <div className="mx-4 mb-4 border border-ink p-4 bg-banner/10">
          <p className="font-serif font-bold text-[14px] text-ink mb-2">How Voting Works</p>
          <ul className="space-y-1 font-sans text-[12px] text-text-dim list-none">
            <li>• <strong>Tap</strong> a line to vote (1 pt to the author)</li>
            <li>• <strong>Long-press</strong> for a standing ovation (3 pts to author, 2 pts to you)</li>
            <li>• You get <strong>1 standing ovation per game</strong> — use it or lose it</li>
            <li>• If you don&rsquo;t vote, your vote is assigned randomly</li>
          </ul>
          <button
            onClick={() => setHintDismissed(true)}
            className="mt-3 font-sans text-[11px] uppercase tracking-[2px] text-ink font-semibold"
          >
            Got it
          </button>
        </div>
      )}

      <p className="font-serif font-medium text-[13px] uppercase tracking-[3px] text-text-muted text-center mb-2">
        Vote for the Best Line
      </p>

      {/* Standing ovation status + vote progress */}
      <div className="flex justify-between items-center mb-2 px-1">
        {isSpectator ? (
          <span className="font-sans text-[11px] text-text-muted">Spectating</span>
        ) : (
          <span className="font-sans text-[11px] text-text-muted">
            {standingOvationAvailable ? "★ 1 standing ovation" : "★ Used"}
          </span>
        )}
        <span className="font-sans text-[11px] text-text-muted">
          {votesIn}/{totalPlayers} voted
        </span>
      </div>

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
          const isPressing = pressingLine === i;

          return (
            <button
              key={i}
              disabled={submitted || isMine || isSpectator}
              onMouseDown={() => handleLongPressStart(i)}
              onMouseUp={handleLongPressEnd}
              onMouseLeave={handleLongPressEnd}
              onTouchStart={() => handleLongPressStart(i)}
              onTouchEnd={handleLongPressEnd}
              onClick={() => handleTap(i)}
              className={`
                w-full text-left p-4 border-2 transition-all duration-150 select-none
                ${isMine
                  ? "opacity-50 cursor-not-allowed border-list-border"
                  : isPressing
                  ? "border-ink bg-banner/20 scale-[1.01]"
                  : isOvation
                  ? "border-ink bg-banner shadow-md scale-[1.02]"
                  : isSelected
                  ? "border-ink bg-ink/5 shadow-sm scale-[1.01]"
                  : "border-list-border hover:border-ink/30 hover:bg-ink/[0.02]"
                }
              `}
              style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
              onContextMenu={(e) => e.preventDefault()}
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
        {isSpectator ? (
          <div className="text-center">
            <p className="font-serif font-bold text-[18px] text-ink mb-1">
              Spectating
            </p>
            <p className="font-sans text-[12px] text-text-muted">
              Players are voting &mdash; you&rsquo;ll join next game
            </p>
          </div>
        ) : !submitted ? (
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={selectedLine === null}
          >
            {selectedLine === null
              ? "Select a Line"
              : isStandingOvation
              ? "★ Standing Ovation"
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
          {votesIn < totalPlayers && (
            <p className="font-body italic text-[13px] text-text-muted text-center mb-2">
              {totalPlayers - votesIn} player{totalPlayers - votesIn !== 1 ? "s" : ""} didn&rsquo;t vote &mdash; their vote{totalPlayers - votesIn !== 1 ? "s" : ""} will be assigned randomly.
            </p>
          )}
          <Button variant="primary" onClick={advanceVoting}>
            Next Story
          </Button>
        </div>
      )}
    </div>
  );
}
