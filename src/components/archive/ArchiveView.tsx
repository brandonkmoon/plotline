"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { trackEvent } from "@/lib/analytics";

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

  useEffect(() => {
    trackEvent("archive_viewed");
  }, []);

  const handleShare = () => {
    trackEvent("copy_archive_link");
    navigator.clipboard
      .writeText(window.location.href)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  return (
    <div className="screen">
      <p className="font-body italic text-[15px] text-text-dim text-center mb-2">
        Played on {formatDate(room.completedAt)} &middot; {room.playerCount}{" "}
        {room.playerCount === 1 ? "player" : "players"} &middot;{" "}
        {room.storyCount} {room.storyCount === 1 ? "story" : "stories"}
      </p>

      <hr className="rule" />

      {stories.map((story, storyIdx) => (
        <section key={story.storyIndex} className="py-10 first:pt-4">
          <p className="font-serif font-medium text-[13px] uppercase tracking-[3px] text-text-muted text-center mb-2">
            Story {storyIdx + 1} of {stories.length}
          </p>
          <p className="font-body italic text-[14px] text-text-dim text-center mb-6">
            Read aloud by {story.readerName}
          </p>

          <div className="space-y-3">
            {story.prompts.map((prompt) => {
              const promptIndex = prompt.slot - 1;
              const isDialogue = promptIndex === 4 || promptIndex === 5;

              return (
                <p
                  key={prompt.slot}
                  className={`font-body text-[18px] text-ink leading-[1.7] pl-4 border-l-2 ${
                    isDialogue ? "italic" : ""
                  }`}
                  style={{
                    borderLeftColor: "#FCEB00",
                    opacity: prompt.wasPlaceholder ? 0.6 : 1,
                  }}
                >
                  {prompt.wasPlaceholder && (
                    <span className="font-sans text-[11px] text-text-muted mr-2 uppercase tracking-[1px]">
                      [placeholder]
                    </span>
                  )}
                  {prompt.contribution}
                </p>
              );
            })}
          </div>

          {storyIdx < stories.length - 1 && <hr className="rule mt-10" />}
        </section>
      ))}

      <hr className="rule" />

      <div className="flex flex-col gap-3 mt-6 mb-8">
        <Link
          href="/"
          className="block w-full text-center font-serif font-medium uppercase text-[16px] py-4 px-6 bg-ink text-white hover:bg-[#333] transition-colors"
          style={{ letterSpacing: "3px", borderRadius: 0 }}
        >
          Play Your Own Game
        </Link>
        <button
          onClick={handleShare}
          className="w-full font-serif font-medium uppercase text-[14px] py-3 px-6 bg-transparent text-ink border-2 border-ink hover:bg-ink hover:text-white transition-colors"
          style={{ letterSpacing: "2px", borderRadius: 0 }}
        >
          {copied ? "Copied!" : "Share"}
        </button>
      </div>
    </div>
  );
}
