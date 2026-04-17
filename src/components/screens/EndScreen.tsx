"use client";

import { useState, useEffect } from "react";
import { useRoom } from "@/lib/client/RoomContext";
import { trackEvent } from "@/lib/analytics";
import Button from "@/components/Button";

const MIN_PLAYERS_TO_START = 4;

export default function EndScreen() {
  const {
    room,
    assembledStories,
    playAgain,
    queueNextGame,
    isHost,
    archiveUrl,
    currentPlayer,
  } = useRoom();

  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [hasQueued, setHasQueued] = useState(false);

  useEffect(() => {
    trackEvent("game_completed");
  }, []);

  if (!room) return null;

  const storyCount = assembledStories?.length ?? 0;
  const hostName = room.players.find((p) => p.isHost)?.name ?? "the host";

  const queuedPlayers = room.players.filter((p) => p.queuedForNextGame);
  const queuedCount = queuedPlayers.length;
  const totalPlayers = room.players.filter((p) => p.isConnected).length;
  const iAmQueued =
    hasQueued || room.players.find((p) => p.id === currentPlayer?.id)?.queuedForNextGame;
  const hostIsQueued = room.players.find((p) => p.isHost)?.queuedForNextGame;
  const canStartNextGame = isHost && hostIsQueued && queuedCount >= MIN_PLAYERS_TO_START;

  const handleQueueNextGame = () => {
    if (hasQueued) return;
    setHasQueued(true);
    queueNextGame();
    trackEvent("queued_next_game");
  };

  const handlePlayAgain = () => {
    trackEvent("play_again");
    playAgain();
  };

  const handleSaveImage = (storyIndex: number) => {
    if (!archiveUrl) return;
    const code = archiveUrl.split("/").pop();
    if (!code) return;
    trackEvent("save_story_card");
    const url = `/api/og/${code}/${storyIndex}`;
    window.open(url, "_blank");
  };

  const toggleCard = (index: number) => {
    setExpandedIndex((prev) => (prev === index ? null : index));
  };

  return (
    <div className="screen anim-fade-in">
      {/* Header */}
      <div className="text-center mb-1">
        <p className="font-serif font-medium text-[13px] uppercase tracking-[3px] text-text-muted mb-2">
          Curtain Call
        </p>
        <h1 className="font-serif font-bold text-[28px] text-ink mb-1">
          That&apos;s a Wrap
        </h1>
        <p className="font-body italic text-[16px] text-text-dim">
          {storyCount} {storyCount === 1 ? "story" : "stories"} &middot;{" "}
          {totalPlayers} {totalPlayers === 1 ? "player" : "players"}
        </p>
      </div>

      <hr className="rule" />

      {/* Story card stack */}
      {storyCount > 0 && (
        <div className="flex flex-col mb-6">
          {assembledStories.map((story, i) => {
            const isExpanded = expandedIndex === i;
            const isLastCollapsed =
              !isExpanded && i === assembledStories.length - 1;

            return (
              <div
                key={story.storyIndex}
                style={{
                  // Overlap cards slightly when collapsed to suggest a stack
                  marginTop: i === 0 ? 0 : isExpanded || expandedIndex === i - 1 ? 8 : -8,
                  transition: "margin-top 0.2s ease",
                  position: "relative",
                  zIndex: isExpanded ? 10 : storyCount - i,
                }}
              >
                {/* Card title row — always visible */}
                <button
                  onClick={() => toggleCard(i)}
                  className="w-full text-left border border-ink bg-white px-4 py-4 flex items-center justify-between"
                  style={{
                    borderBottom: isExpanded ? "none" : undefined,
                    // Subtle shadow to suggest depth on collapsed cards below
                    boxShadow:
                      !isExpanded && !isLastCollapsed
                        ? "0 3px 0 0 #1a1a1a20"
                        : undefined,
                  }}
                >
                  <span className="font-serif font-bold text-[15px] text-ink leading-snug pr-4">
                    {story.title}
                  </span>
                  <span className="font-sans text-[18px] text-text-muted flex-shrink-0">
                    {isExpanded ? "↑" : "↓"}
                  </span>
                </button>

                {/* Expanded card body */}
                {isExpanded && (
                  <div className="border border-t-0 border-ink bg-white px-4 pb-5">
                    {/* Story text */}
                    <div className="pt-4 pb-4 flex flex-col gap-[6px]">
                      {story.sections.map((section, si) => (
                        <p
                          key={si}
                          className={
                            section.style === "name"
                              ? "font-serif font-bold text-[15px] text-ink"
                              : section.style === "dialogue"
                              ? "font-body italic text-[15px] text-ink"
                              : "font-body text-[15px] text-ink"
                          }
                          style={{ lineHeight: 1.5 }}
                        >
                          {section.text}
                        </p>
                      ))}
                    </div>

                    {/* Save image button */}
                    {archiveUrl && (
                      <>
                        <hr className="border-t border-ink/20 mb-4" />
                        <button
                          onClick={() => handleSaveImage(story.storyIndex)}
                          className="font-sans text-[12px] uppercase tracking-[2px] text-text-dim hover:text-ink transition-colors"
                        >
                          Save Image ↗
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Queue / next game controls */}
      <div className="flex flex-col gap-3">
        {/* "Join Next Game" for everyone */}
        {!iAmQueued ? (
          <Button variant="secondary" onClick={handleQueueNextGame}>
            Join Next Game
          </Button>
        ) : (
          <div className="border border-ink px-4 py-3 text-center">
            <p className="font-sans text-[13px] uppercase tracking-[2px] text-text-muted">
              {queuedCount} of {totalPlayers}{" "}
              {totalPlayers === 1 ? "player" : "players"} ready
            </p>
          </div>
        )}

        {/* Host-only start button — appears once host is queued + enough players */}
        {isHost && iAmQueued && (
          canStartNextGame ? (
            <Button variant="primary" onClick={handlePlayAgain}>
              Start Next Game
            </Button>
          ) : (
            <p className="font-body italic text-[14px] text-text-dim text-center">
              Waiting for {MIN_PLAYERS_TO_START - queuedCount} more{" "}
              {MIN_PLAYERS_TO_START - queuedCount === 1 ? "player" : "players"}&hellip;
            </p>
          )
        )}

        {/* Non-host waiting message */}
        {!isHost && iAmQueued && !hostIsQueued && (
          <p className="font-body italic text-[14px] text-text-dim text-center">
            Waiting for {hostName} to join&hellip;
          </p>
        )}
        {!isHost && iAmQueued && hostIsQueued && (
          <p className="font-body italic text-[14px] text-text-dim text-center">
            Waiting for {hostName} to start&hellip;
          </p>
        )}
      </div>
    </div>
  );
}
