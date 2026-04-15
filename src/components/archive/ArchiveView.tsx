"use client";

import { useState } from "react";
import Link from "next/link";
import GoldBar from "@/components/GoldBar";

interface ArchivePrompt {
  slot: number;
  promptText: string;
  contribution: string;
  authorName: string;
  wasPlaceholder: boolean;
}

interface ArchiveStory {
  storyIndex: number;
  readerName: string;
  prompts: ArchivePrompt[];
}

interface ArchiveRoom {
  code: string;
  createdAt: number;
  completedAt: number;
  playerCount: number;
  storyCount: number;
}

interface ArchiveViewProps {
  room: ArchiveRoom;
  stories: ArchiveStory[];
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function ArchiveView({ room, stories }: ArchiveViewProps) {
  const [copied, setCopied] = useState(false);

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="flex flex-col items-center min-h-screen px-6 py-12">
      <div className="flex flex-col items-center w-full" style={{ maxWidth: 420 }}>
        {/* Logo */}
        <p
          className="font-display text-[28px] text-text-muted mb-6"
          style={{
            textShadow: "2px 2px 0 rgba(0,0,0,.85), 0 0 30px rgba(212,168,67,.1)",
          }}
        >
          Plotline
        </p>

        {/* Room metadata */}
        <p className="font-serif italic text-[16px] text-text-dim text-center mb-6">
          Played on {formatDate(room.completedAt)} &middot; {room.playerCount}{" "}
          {room.playerCount === 1 ? "player" : "players"} &middot;{" "}
          {room.storyCount} {room.storyCount === 1 ? "story" : "stories"}
        </p>

        <GoldBar />

        {/* Stories */}
        <div className="w-full mt-8">
          {stories.map((story, storyIdx) => (
            <div key={story.storyIndex} className="py-16 first:pt-8">
              {/* Story counter */}
              <p className="gold-text font-serif text-[18px] text-center mb-8">
                Story {storyIdx + 1} of {stories.length}
              </p>

              {/* Story content with decorative quote */}
              <div className="relative">
                {/* Decorative opening quote */}
                <span
                  className="absolute top-0 left-0 font-serif select-none pointer-events-none"
                  style={{
                    fontSize: 220,
                    lineHeight: "0.8",
                    opacity: 0.04,
                    color: "var(--gold)",
                    transform: "translate(-10px, -20px)",
                  }}
                >
                  &ldquo;
                </span>

                {/* Story lines */}
                <div className="relative space-y-4">
                  {story.prompts.map((prompt) => {
                    // slot is 1-indexed, so promptIndex = slot - 1
                    const promptIndex = prompt.slot - 1;
                    const isCharacterName = promptIndex === 0 || promptIndex === 1;
                    const isDialogue = promptIndex === 4 || promptIndex === 5;

                    if (prompt.wasPlaceholder) {
                      return (
                        <p
                          key={prompt.slot}
                          className={`font-serif text-[26px] leading-relaxed ${
                            isDialogue ? "italic" : ""
                          }`}
                          style={{ opacity: 0.5 }}
                        >
                          <span className="text-gold-dark text-[14px] mr-1">
                            &#10022;
                          </span>
                          {isCharacterName ? (
                            <span className="gold-text font-semibold italic">
                              {prompt.contribution}
                            </span>
                          ) : (
                            <span className="text-text italic">
                              {prompt.contribution}
                            </span>
                          )}
                        </p>
                      );
                    }

                    return (
                      <p
                        key={prompt.slot}
                        className={`font-serif text-[26px] leading-relaxed ${
                          isDialogue ? "italic" : ""
                        }`}
                      >
                        {isCharacterName ? (
                          <span className="gold-text font-semibold">
                            {prompt.contribution}
                          </span>
                        ) : (
                          <span className="text-text">
                            {prompt.contribution}
                          </span>
                        )}
                      </p>
                    );
                  })}
                </div>
              </div>

              {/* Reader attribution */}
              <p
                className="mt-6 font-sans text-text-muted text-center"
                style={{
                  fontSize: 13,
                  fontVariant: "small-caps",
                  letterSpacing: "2px",
                }}
              >
                read aloud by{" "}
                <span className="text-gold">{story.readerName}</span>
              </p>

              {/* Divider between stories (not after last) */}
              {storyIdx < stories.length - 1 && (
                <div className="flex justify-center mt-12">
                  <GoldBar />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Bottom actions */}
        <div className="w-full mt-8 mb-12 flex flex-col gap-4">
          <GoldBar />
          <div className="mt-6 flex flex-col gap-4">
            <Link
              href="/"
              className="gold-gradient-bg text-[#0a0a08] font-sans text-[16px] font-bold uppercase tracking-widest py-[22px] px-[56px] text-center block"
              style={{ borderRadius: 0 }}
            >
              Play Your Own Game
            </Link>
            <button
              onClick={handleShare}
              className="bg-transparent border-2 border-border text-text-dim font-sans text-[16px] font-bold uppercase tracking-widest py-[22px] px-[56px] transition-colors hover:border-gold-dark hover:text-text w-full"
              style={{ borderRadius: 0 }}
            >
              {copied ? "Copied!" : "Share"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
