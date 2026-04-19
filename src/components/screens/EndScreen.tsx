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
    playerStatuses,
  } = useRoom();

  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);
  const [hasQueued, setHasQueued] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    trackEvent("game_completed");
  }, []);

  if (!room) return null;

  const storyCount = assembledStories?.length ?? 0;
  const connectedPlayers = room.players.filter((p) => p.isConnected);
  const totalPlayers = connectedPlayers.length;
  const hostName = room.players.find((p) => p.isHost)?.name ?? "the host";
  const queuedCount = room.players.filter((p) => p.queuedForNextGame).length;
  const iAmQueued =
    hasQueued ||
    !!room.players.find((p) => p.id === currentPlayer?.id)?.queuedForNextGame;
  const hostIsQueued = !!room.players.find((p) => p.isHost)?.queuedForNextGame;
  const canStartNextGame =
    isHost && hostIsQueued && queuedCount >= MIN_PLAYERS_TO_START;

  // Names of connected players who haven't queued yet (for waiting message)
  const unqueuedNames = room.players
    .filter((p) => p.isConnected && !p.queuedForNextGame)
    .map((p) => p.name);

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

  const handleShare = (story: { storyIndex: number; title?: string }) => {
    if (!archiveUrl) return;
    const full = archiveUrl.startsWith("http")
      ? archiveUrl
      : `${window.location.origin}${archiveUrl}`;
    trackEvent("share_story_card");
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator
        .share({
          title: story.title ?? "A Plotline story",
          text: `"${story.title}" — a story from Plotline`,
          url: full,
        })
        .catch(() => {});
    } else {
      navigator.clipboard.writeText(full).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  const handleSaveImage = (storyIndex: number) => {
    if (!archiveUrl) return;
    const code = archiveUrl.split("/").pop();
    if (!code) return;
    trackEvent("save_story_card");
    window.open(`/api/og/${code}/${storyIndex}`, "_blank");
  };

  const handleCopyLink = () => {
    if (!archiveUrl) return;
    const full = archiveUrl.startsWith("http")
      ? archiveUrl
      : `${window.location.origin}${archiveUrl}`;
    navigator.clipboard.writeText(full).then(() => {
      setCopied(true);
      trackEvent("copied_archive_link");
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const toggleCard = (index: number) => {
    setExpandedIndex((prev) => (prev === index ? null : index));
  };

  return (
    <div className="screen">
      {/* ── Header — theatrical entrance ─────────────────────── */}
      <div className="prompt-header-enter text-center mb-1">
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

      <hr className="rule prompt-rule-enter" />

      <div className="prompt-body-enter">
        {/* ── Story cards ──────────────────────────────────────── */}
        {storyCount > 0 && (
          <div className="flex flex-col mb-6">
            {assembledStories.map((story, i) => {
              const isExpanded = expandedIndex === i;

              return (
                <div
                  key={story.storyIndex}
                  style={{
                    marginTop: i === 0 ? 0 : 8,
                    position: "relative",
                    zIndex: isExpanded ? 10 : storyCount - i,
                  }}
                >
                  {/* Yellow Playbill header — always visible */}
                  <button
                    onClick={() => toggleCard(i)}
                    className="w-full text-left px-4 py-3 flex items-center justify-between border border-ink"
                    style={{ background: "var(--banner)" }}
                  >
                    <div className="flex flex-col pr-4">
                      <span className="font-sans text-[10px] uppercase tracking-[2px] mb-0.5" style={{ color: "rgba(26,26,26,0.5)" }}>
                        Story {i + 1} of {storyCount}
                      </span>
                      <span className="font-serif font-bold text-[15px] text-ink leading-snug">
                        {story.title}
                      </span>
                    </div>
                    <span className="font-sans text-[16px] text-ink flex-shrink-0">
                      {isExpanded ? "↑" : "↓"}
                    </span>
                  </button>

                  {/* Expanded white body */}
                  {isExpanded && (
                    <div className="border border-t-0 border-ink bg-white px-4 pb-5">
                      <div className="pt-4 pb-4 flex flex-col gap-[6px]">
                        {story.sections.map((section, si) => (
                          <p
                            key={si}
                            className={
                              section.style === "name"
                                ? "font-serif font-bold text-[17px] text-ink"
                                : section.style === "dialogue"
                                ? "font-body italic text-[17px] text-ink"
                                : "font-body text-[17px] text-ink"
                            }
                            style={{ lineHeight: 1.6 }}
                          >
                            {section.text}
                          </p>
                        ))}
                      </div>

                      {archiveUrl && (
                        <>
                          <hr className="border-t border-ink/20 mb-4" />
                          <div className="flex items-center justify-between">
                            <button
                              onClick={() => handleShare(story)}
                              className="font-sans text-[12px] uppercase tracking-[2px] text-ink hover:text-text-dim transition-colors"
                            >
                              Share ↗
                            </button>
                            <button
                              onClick={() => handleSaveImage(story.storyIndex)}
                              className="font-sans text-[12px] uppercase tracking-[2px] text-text-dim hover:text-ink transition-colors"
                            >
                              Save Image ↗
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Archive link ─────────────────────────────────────── */}
        {archiveUrl && (
          <div className="border border-ink px-4 py-4 mb-4">
            <p className="font-serif font-medium text-[11px] uppercase tracking-[2.5px] text-text-muted mb-3">
              Share This Game
            </p>
            <div className="flex items-center gap-3">
              <p className="font-sans text-[13px] text-text-dim truncate flex-1">
                {archiveUrl.startsWith("http")
                  ? archiveUrl
                  : `${typeof window !== "undefined" ? window.location.origin : ""}${archiveUrl}`}
              </p>
              <button
                onClick={handleCopyLink}
                className="font-sans text-[12px] uppercase tracking-[2px] flex-shrink-0 border border-ink px-3 py-1 transition-colors"
                style={{
                  background: copied ? "var(--ink)" : "transparent",
                  color: copied ? "var(--bg)" : "var(--ink)",
                }}
              >
                {copied ? "Copied ✓" : "Copy Link"}
              </button>
            </div>
          </div>
        )}

        {/* ── Player status list ───────────────────────────────── */}
        <ul className="w-full mb-6 list-none">
          {room.players.map((player) => {
            const status = playerStatuses[player.id];
            const isDisconnected = status === "disconnected";
            const isReconnecting = status === "reconnecting";
            const isQueued = player.queuedForNextGame;
            const dim = isDisconnected
              ? "opacity-30"
              : isReconnecting
              ? "opacity-50"
              : "";

            return (
              <li
                key={player.id}
                className={`font-body text-[15px] py-2 flex justify-between items-center border-b border-list-border last:border-b-0 ${dim}`}
              >
                <span className={isDisconnected ? "line-through" : ""}>
                  {player.name}
                  {player.isHost && (
                    <span className="ml-2 font-sans text-[10px] uppercase tracking-[1px] text-text-muted">
                      Host
                    </span>
                  )}
                  {isReconnecting && (
                    <span className="ml-2 font-sans italic text-[12px] text-text-muted">
                      reconnecting
                    </span>
                  )}
                </span>
                <span
                  className={`font-sans text-[13px] ${
                    isQueued ? "text-ink" : "text-text-muted"
                  }`}
                >
                  {isDisconnected ? "offline" : isQueued ? "Ready \u2713" : "\u22EF"}
                </span>
              </li>
            );
          })}
        </ul>

        {/* ── Queue / next game controls ───────────────────────── */}
        <div className="flex flex-col gap-3">
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

          {/* Host-only start button */}
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

          {/* Non-host waiting messages */}
          {!isHost && iAmQueued && !hostIsQueued && (
            <p className="font-body italic text-[14px] text-text-dim text-center">
              {unqueuedNames.length === 1
                ? `Waiting for ${unqueuedNames[0]} to join\u2026`
                : unqueuedNames.length === 2
                ? `Waiting for ${unqueuedNames[0]} and ${unqueuedNames[1]} to join\u2026`
                : `Waiting for ${unqueuedNames.length} more players to join\u2026`}
            </p>
          )}
          {!isHost && iAmQueued && hostIsQueued && (
            <p className="font-body italic text-[14px] text-text-dim text-center">
              Waiting for {hostName} to start&hellip;
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
