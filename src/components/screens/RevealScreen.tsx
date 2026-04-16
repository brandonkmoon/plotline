"use client";

import { useState, useCallback } from "react";
import { useRoom } from "@/lib/client/RoomContext";
import BlackletterHeading from "@/components/BlackletterHeading";
import GoldBar from "@/components/GoldBar";
import Button from "@/components/Button";

export default function RevealScreen() {
  const { assembledStories, advanceReveal, revealState, revealAdvance, nextStory, currentPlayer, room } = useRoom();

  // Fallback local state for backward compat (no REVEAL_STATE from server)
  const [localStoryIdx, setLocalStoryIdx] = useState(0);
  const [localRevealedLines, setLocalRevealedLines] = useState(0);

  const usingSyncedReveal = revealState !== null;

  const totalStories = assembledStories.length;
  const currentStoryIdx = usingSyncedReveal ? revealState.storyIndex : localStoryIdx;
  const revealedLines = usingSyncedReveal ? revealState.revealedCount : localRevealedLines;

  const story = assembledStories[currentStoryIdx];
  const totalLines = story ? story.sections.length : 0;
  const allRevealed = story ? revealedLines >= totalLines : false;

  const isReader = usingSyncedReveal && currentPlayer
    ? currentPlayer.id === revealState.readerId
    : true; // In local mode, everyone can tap

  const readerName = usingSyncedReveal
    ? revealState.readerName
    : story?.readerName ?? "someone";

  const handleTap = useCallback(() => {
    if (!story || allRevealed) return;
    if (usingSyncedReveal) {
      if (isReader) {
        revealAdvance();
      }
    } else {
      setLocalRevealedLines((prev) => prev + 1);
    }
  }, [story, allRevealed, usingSyncedReveal, isReader, revealAdvance]);

  const handleNextStory = useCallback(() => {
    if (usingSyncedReveal) {
      nextStory();
    } else {
      if (localStoryIdx < totalStories - 1) {
        setLocalStoryIdx((prev) => prev + 1);
        setLocalRevealedLines(0);
      } else {
        advanceReveal();
      }
    }
  }, [usingSyncedReveal, nextStory, localStoryIdx, totalStories, advanceReveal]);

  if (!story || !room) return null;

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
            {isReader ? (
              <p className="font-serif italic text-[16px] gold-text font-semibold">
                Your turn &mdash; read this aloud!
              </p>
            ) : (
              <p className="font-serif italic text-[16px] text-text-muted">
                {readerName} is reading
              </p>
            )}
          </div>
        )}

        {/* Story sections (narrative prose) */}
        <div className="mt-8 w-full space-y-4">
          {story.sections.map((section, i) => {
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
            {usingSyncedReveal && !isReader
              ? `Waiting for ${readerName} to reveal...`
              : "Tap anywhere to reveal the next line"}
          </p>
        ) : (
          <div className="mt-8 w-full flex flex-col items-center gap-4">
            <p className="font-serif italic text-[16px] text-text-dim">
              Read aloud by {readerName}
            </p>
            {(isReader || !usingSyncedReveal) && (
              <Button variant="primary" onClick={handleNextStory} className="w-full">
                {currentStoryIdx < totalStories - 1
                  ? "Next Story \u2192"
                  : "Continue"}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
