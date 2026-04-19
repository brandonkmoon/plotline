"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRoom } from "@/lib/client/RoomContext";
import Button from "@/components/Button";
import PendingPlayersBadge from "@/components/PendingPlayersBadge";

const SECTIONS_PER_STORY = 7;
const TRANSITION_MS = 2000;

export default function RevealScreen() {
  const {
    assembledStories,
    advanceReveal,
    revealState,
    revealAdvance,
    nextStory,
    currentPlayer,
    justBecameHost,
    room,
  } = useRoom();

  const [localStoryIdx, setLocalStoryIdx] = useState(0);
  const [localRevealedLines, setLocalRevealedLines] = useState(0);

  const usingSyncedReveal = revealState !== null;

  const totalStories = assembledStories?.length ?? 0;
  const currentStoryIdx = usingSyncedReveal
    ? revealState.storyIndex
    : localStoryIdx;
  const revealedLines = usingSyncedReveal
    ? revealState.revealedCount
    : localRevealedLines;

  const story = assembledStories[currentStoryIdx];
  const totalLines = story?.sections?.length ?? SECTIONS_PER_STORY;
  const allRevealed = story ? revealedLines >= totalLines : false;

  // If the designated reader has disconnected, the host steps in so the
  // reveal doesn't get stuck.
  const readerPlayer = usingSyncedReveal
    ? room?.players.find((p) => p.id === revealState.readerId)
    : null;
  const readerIsOffline =
    usingSyncedReveal && readerPlayer ? !readerPlayer.isConnected : false;
  const isHostFallbackReader =
    readerIsOffline && currentPlayer?.id === room?.hostId;

  const isReader = usingSyncedReveal && currentPlayer
    ? currentPlayer.id === revealState.readerId || isHostFallbackReader
    : true;

  const readerName = usingSyncedReveal
    ? revealState.readerName
    : story?.readerName ?? "someone";

  const [transitioning, setTransitioning] = useState(false);
  const [nextReaderName, setNextReaderName] = useState<string | null>(null);
  const [nextStoryNumber, setNextStoryNumber] = useState<number | null>(null);
  const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  useEffect(() => {
    return () => {
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
      }
    };
  }, []);

  const handleTap = useCallback(() => {
    if (!story) return;
    if (!isReader) return;
    if (revealedLines >= SECTIONS_PER_STORY) return;
    if (usingSyncedReveal) {
      revealAdvance();
    } else {
      setLocalRevealedLines((prev) => Math.min(prev + 1, SECTIONS_PER_STORY));
    }
  }, [story, isReader, revealedLines, usingSyncedReveal, revealAdvance]);

  const handleNextStory = useCallback(() => {
    if (!assembledStories) return;

    const isFinal = currentStoryIdx >= totalStories - 1;

    if (usingSyncedReveal) {
      if (!isFinal) {
        const next = assembledStories[currentStoryIdx + 1];
        setNextReaderName(next?.readerName ?? "someone");
        setNextStoryNumber(currentStoryIdx + 2);
        setTransitioning(true);
        if (transitionTimeoutRef.current) {
          clearTimeout(transitionTimeoutRef.current);
        }
        transitionTimeoutRef.current = setTimeout(() => {
          setTransitioning(false);
          setNextReaderName(null);
          setNextStoryNumber(null);
        }, TRANSITION_MS);
      }
      nextStory();
    } else {
      if (localStoryIdx < totalStories - 1) {
        setLocalStoryIdx((prev) => prev + 1);
        setLocalRevealedLines(0);
      } else {
        advanceReveal();
      }
    }
  }, [
    usingSyncedReveal,
    nextStory,
    localStoryIdx,
    totalStories,
    advanceReveal,
    assembledStories,
    currentStoryIdx,
  ]);

  if (!story || !room) return null;

  // ── Transition card (between stories) ────────────────────
  if (transitioning && nextStoryNumber !== null) {
    return (
      <>
        <div className="screen text-center anim-fade-in">
          <p className="font-serif font-medium text-[13px] uppercase tracking-[3px] text-text-muted mb-2">
            Up Next
          </p>
          <h1 className="font-serif font-bold text-[24px] text-ink mb-1">
            Story {nextStoryNumber} of {totalStories}
          </h1>
          <p className="font-body italic text-[16px] text-text-dim">
            {nextReaderName} is reading next
          </p>
        </div>
        <PendingPlayersBadge />
      </>
    );
  }

  // ── Non-reader view (clean, static) ──────────────────────
  if (!isReader && usingSyncedReveal) {
    return (
      <>
        <div className="screen text-center anim-fade-in">
          {justBecameHost && (
            <p className="font-sans text-[12px] uppercase tracking-[2px] text-white bg-ink px-4 py-2 text-center mb-4">
              You&rsquo;re now the host
            </p>
          )}
          <hr className="rule" />
          <p className="font-serif font-medium text-[13px] uppercase tracking-[3px] text-text-muted mb-2">
            Now Playing
          </p>
          <h1 className="font-serif font-bold text-[24px] text-ink mb-1">
            Story {currentStoryIdx + 1} of {totalStories}
          </h1>
          <p className="font-body italic text-[16px] text-text-dim">
            Read by {readerName}
          </p>
          <hr className="rule" />
          <p className="mt-6 font-body italic text-[16px] text-text-muted">
            Listening&hellip;
          </p>
        </div>
        <PendingPlayersBadge />
      </>
    );
  }

  // ── Reader view ──────────────────────────────────────────
  const isFinalStory = currentStoryIdx >= totalStories - 1;

  return (
    <>
      <div
        className="screen cursor-pointer select-none anim-fade-in"
        onClick={!allRevealed ? handleTap : undefined}
      >
        {justBecameHost && (
          <p className="font-sans text-[12px] uppercase tracking-[2px] text-white bg-ink px-4 py-2 text-center mb-4">
            You&rsquo;re now the host
          </p>
        )}

        <hr className="rule" />

        <p className="font-serif font-medium text-[13px] uppercase tracking-[3px] text-text-muted text-center mb-2">
          Now Playing
        </p>
        <h1 className="font-serif font-bold text-[24px] text-ink text-center mb-1">
          Story {currentStoryIdx + 1} of {totalStories}
        </h1>
        <p className="font-body italic text-[16px] text-text-dim text-center mb-1">
          Read by {readerName}
        </p>
        <p className="font-body italic text-[14px] text-[#888] text-center mb-6">
          {isHostFallbackReader
            ? `${readerName} is offline \u2014 you\u2019re reading`
            : "Your turn \u2014 read this aloud"}
        </p>

        <hr className="rule" />

        <div className="mt-2 space-y-3">
          {(story?.sections ?? []).map((section, i) => {
            if (i >= revealedLines) return null;
            const isDialogue = section.style === "dialogue";

            return (
              <p
                key={i}
                className={`font-body text-[18px] text-ink leading-[1.7] pl-4 border-l-2 ${
                  isDialogue ? "italic" : ""
                }`}
                style={{ borderLeftColor: "#FCEB00" }}
              >
                {section.text}
              </p>
            );
          })}

          {!allRevealed && (
            <p
              className="font-body text-[18px] leading-[1.7] pl-4 border-l-2"
              style={{
                opacity: 0.3,
                borderLeftColor: "#e0e0e0",
                color: "#999",
              }}
            >
              Tap to reveal the next line&hellip;
            </p>
          )}
        </div>

        {allRevealed && (
          <div className="mt-8">
            <Button variant="secondary" onClick={handleNextStory}>
              {isFinalStory ? "That\u2019s a Wrap \u2192" : "Next Story \u2192"}
            </Button>
          </div>
        )}
      </div>
      <PendingPlayersBadge />
    </>
  );
}
