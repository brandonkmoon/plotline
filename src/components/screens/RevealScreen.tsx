"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRoom } from "@/lib/client/RoomContext";
import BlackletterHeading from "@/components/BlackletterHeading";
import GoldBar from "@/components/GoldBar";
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
    room,
  } = useRoom();

  // Fallback local state for backward compat (no REVEAL_STATE from server)
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

  const isReader =
    usingSyncedReveal && currentPlayer
      ? currentPlayer.id === revealState.readerId
      : true; // In local mode, everyone can tap

  const readerName = usingSyncedReveal
    ? revealState.readerName
    : story?.readerName ?? "someone";

  // Transition state: after clicking "Next Story", show a 2s transition
  // card announcing the next story before the server's REVEAL_STATE
  // arrives.
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

  // Clear transition state when the synced reveal state advances.
  useEffect(() => {
    if (!transitioning) return;
    if (!usingSyncedReveal) return;
    // Once server-side reveal state matches the new story, we can
    // drop out of transition mode even before the 2s expire.
    if (nextStoryNumber !== null && revealState.storyIndex + 1 === nextStoryNumber) {
      // The state caught up; leave the transition visible until the
      // timer expires so it doesn't flash.
    }
  }, [revealState, transitioning, nextStoryNumber, usingSyncedReveal]);

  const handleTap = useCallback(() => {
    if (!story) return;
    // Only the reader can advance. Tapping past the 7th line does nothing.
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
      // Start local transition first
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

  // Transition screen — shown after "Next Story" tap
  if (transitioning && nextStoryNumber !== null) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6">
        <div
          className="flex flex-col items-center w-full text-center anim-fade-in"
          style={{ maxWidth: 420 }}
        >
          <p
            className="font-sans text-[12px] font-semibold uppercase text-text-muted mb-3"
            style={{ letterSpacing: "4px" }}
          >
            Up Next
          </p>
          <BlackletterHeading size="56px">
            <span className="gold-text">
              Story {nextStoryNumber} of {totalStories}
            </span>
          </BlackletterHeading>
          <div className="mt-6">
            <GoldBar />
          </div>
          <p className="mt-6 font-serif italic text-[18px] text-text-dim">
            {nextReaderName} is reading next
          </p>
        </div>
        <PendingPlayersBadge />
      </div>
    );
  }

  // Non-reader view — no story text, just an ambient waiting screen
  if (!isReader && usingSyncedReveal) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6">
        <div
          className="flex flex-col items-center w-full text-center"
          style={{ maxWidth: 420 }}
        >
          <p
            className="font-sans text-[12px] font-semibold uppercase text-text-muted mb-3"
            style={{ letterSpacing: "4px" }}
          >
            Story {currentStoryIdx + 1} of {totalStories}
          </p>
          <BlackletterHeading size="48px" className="breathing-glow">
            <span className="gold-text">{readerName}</span>
          </BlackletterHeading>
          <p className="mt-4 font-serif italic text-[20px] text-text-dim">
            is reading Story {currentStoryIdx + 1}
          </p>
          <div className="mt-6">
            <GoldBar />
          </div>
          <p className="mt-8 font-serif italic text-[18px] text-text-muted">
            Listening
            <span className="dot-cycle dot-cycle-1">.</span>
            <span className="dot-cycle dot-cycle-2">.</span>
            <span className="dot-cycle dot-cycle-3">.</span>
          </p>
        </div>
        <PendingPlayersBadge />
      </div>
    );
  }

  const isFinalStory = currentStoryIdx >= totalStories - 1;

  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen px-6 cursor-pointer select-none"
      onClick={!allRevealed ? handleTap : undefined}
    >
      <div
        className="flex flex-col items-center w-full"
        style={{ maxWidth: 420 }}
      >
        {/* Eyebrow */}
        <p
          className="font-sans text-[12px] font-semibold uppercase text-text-muted mb-2"
          style={{ letterSpacing: "4px" }}
        >
          Your Story
        </p>

        {/* Story counter */}
        <p className="gold-text font-sans text-[14px] font-medium mb-6">
          Story {currentStoryIdx + 1} of {totalStories}
        </p>

        <GoldBar />

        {/* Reader banner */}
        {usingSyncedReveal && (
          <div className="mt-4 w-full text-center">
            <p className="font-serif italic text-[16px] gold-text font-semibold">
              Your turn &mdash; read this aloud!
            </p>
          </div>
        )}

        {/* Story sections (narrative prose) */}
        <div className="mt-8 w-full space-y-4">
          {(story?.sections ?? []).map((section, i) => {
            if (i >= revealedLines) return null;

            const isName = section.style === "name";
            const isLocation = section.style === "location";
            const isAction = section.style === "action";
            const isDialogue = section.style === "dialogue";
            const isEnding = section.style === "ending";

            return (
              <p
                key={i}
                className={`
                  font-serif text-[28px] leading-relaxed anim-reveal-line
                  ${isDialogue ? "italic" : ""}
                `}
              >
                {isName ? (
                  <span className="gold-text font-semibold">{section.text}</span>
                ) : isLocation || isAction || isEnding ? (
                  <span className="gold-text">{section.text}</span>
                ) : (
                  <span className="text-text">{section.text}</span>
                )}
              </p>
            );
          })}
        </div>

        {/* Instruction or controls */}
        {!allRevealed ? (
          <p className="mt-8 font-serif italic text-[16px] text-text-muted text-center anim-fade-in">
            Tap anywhere to reveal the next line
          </p>
        ) : (
          <div className="mt-8 w-full flex flex-col items-center gap-4">
            <p className="font-serif italic text-[16px] text-text-dim">
              Read aloud by {readerName}
            </p>
            <Button
              variant="primary"
              onClick={handleNextStory}
              className="w-full"
            >
              {isFinalStory ? "That\u2019s a Wrap \u2192" : "Next Story \u2192"}
            </Button>
          </div>
        )}
      </div>
      <PendingPlayersBadge />
    </div>
  );
}
