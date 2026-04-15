"use client";

import { useState, useCallback } from "react";
import { useRoom } from "@/lib/client/RoomContext";
import BlackletterHeading from "@/components/BlackletterHeading";
import GoldBar from "@/components/GoldBar";
import Button from "@/components/Button";

export default function RevealScreen() {
  const { assembledStories, advanceReveal, room } = useRoom();
  const [currentStoryIdx, setCurrentStoryIdx] = useState(0);
  const [revealedLines, setRevealedLines] = useState(0);

  const totalStories = assembledStories.length;
  const story = assembledStories[currentStoryIdx];
  const allRevealed = story ? revealedLines >= story.responses.length : false;

  const handleTap = useCallback(() => {
    if (!story) return;
    if (revealedLines < story.responses.length) {
      setRevealedLines((prev) => prev + 1);
    }
  }, [story, revealedLines]);

  const handleNextStory = useCallback(() => {
    if (currentStoryIdx < totalStories - 1) {
      setCurrentStoryIdx((prev) => prev + 1);
      setRevealedLines(0);
    } else {
      // All stories revealed, advance
      advanceReveal();
    }
  }, [currentStoryIdx, totalStories, advanceReveal]);

  if (!story || !room) return null;

  // Find the "author" — the player whose story this is based on story index
  const storyPlayer = room.players[story.storyIndex];
  const readerName = storyPlayer?.name ?? "someone";

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

        {/* Story lines */}
        <div className="mt-8 w-full space-y-4">
          {story.responses.map((line, i) => {
            if (i >= revealedLines) return null;

            // Prompts 0,1 (character names) get gold highlight
            const isCharacterName = i === 0 || i === 1;
            // Prompts 4,5 (dialogue) get italic
            const isDialogue = i === 4 || i === 5;

            return (
              <p
                key={i}
                className={`
                  font-serif text-[28px] leading-relaxed anim-reveal-line
                  ${isDialogue ? "italic" : ""}
                `}
              >
                {isCharacterName ? (
                  <span className="gold-text font-semibold">{line}</span>
                ) : (
                  <span className="text-text">{line}</span>
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
            <Button variant="primary" onClick={handleNextStory} className="w-full">
              {currentStoryIdx < totalStories - 1
                ? "Next Story \u2192"
                : "Continue"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
