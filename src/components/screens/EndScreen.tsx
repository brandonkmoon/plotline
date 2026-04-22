"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useRoom } from "@/lib/client/RoomContext";
import { trackEvent } from "@/lib/analytics";
import Button from "@/components/Button";

export default function EndScreen() {
  const {
    room,
    assembledStories,
    createNextRoom,
    archiveUrl,
    currentPlayer,
    currentPendingPlayer,
    playerStatuses,
    setReady,
  } = useRoom();

  const router = useRouter();
  const isSpectator = currentPendingPlayer !== null;

  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);
  const [creatingLobby, setCreatingLobby] = useState(false);
  const [spectatorReady, setSpectatorReady] = useState(
    currentPendingPlayer?.ready ?? false
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    trackEvent("game_completed");
  }, []);

  // Once nextRoomCode appears after we triggered creation, navigate there
  useEffect(() => {
    if (creatingLobby && room?.nextRoomCode) {
      router.push(`/room/${room.nextRoomCode}`);
    }
  }, [creatingLobby, room?.nextRoomCode, router]);

  if (!room) return null;

  const storyCount = assembledStories?.length ?? 0;
  const totalPlayers = room.players.filter((p) => p.isConnected).length;

  const handleCreateLobby = () => {
    if (creatingLobby) return;
    setCreatingLobby(true);
    createNextRoom();
    trackEvent("create_next_lobby");
  };

  const handleJoinLobby = () => {
    if (!room.nextRoomCode) return;
    trackEvent("join_next_lobby");
    router.push(`/room/${room.nextRoomCode}`);
  };

  const handleShare = (story: { storyIndex: number; title?: string; sections?: { text: string }[] }) => {
    const full = archiveUrl
      ? (archiveUrl.startsWith("http") ? archiveUrl : `${window.location.origin}${archiveUrl}`)
      : null;
    const storyText = story.sections?.map((s) => s.text).join("\n\n") ?? "";
    trackEvent("share_story_card");
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator
        .share({
          title: story.title ?? "A Plotline story",
          text: `"${story.title}" — a story from Plotline\n\n${storyText}`,
          ...(full ? { url: full } : {}),
        })
        .catch(() => {});
    } else {
      const toCopy = full ?? storyText;
      navigator.clipboard.writeText(toCopy).then(() => {
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

                      <hr className="border-t border-ink/20 mb-4" />
                      <div className="flex items-center justify-between">
                        <button
                          onClick={() => handleShare(story)}
                          className="font-sans text-[12px] uppercase tracking-[2px] text-ink hover:text-text-dim transition-colors"
                        >
                          Share ↗
                        </button>
                        {archiveUrl && (
                          <button
                            onClick={() => handleSaveImage(story.storyIndex)}
                            className="font-sans text-[12px] uppercase tracking-[2px] text-text-dim hover:text-ink transition-colors"
                          >
                            Save Image ↗
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Player status list ───────────────────────────────── */}
        <ul className="w-full mb-6 list-none">
          {room.players.map((player) => {
            const status = playerStatuses[player.id];
            const isDisconnected = status === "disconnected";
            const isReconnecting = status === "reconnecting";
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
                {isDisconnected && (
                  <span className="font-sans text-[13px] text-text-muted">
                    offline
                  </span>
                )}
              </li>
            );
          })}
          {/* Spectators (pending/late-join players) */}
          {(room.pendingPlayers ?? []).map((pending) => (
            <li
              key={pending.id}
              className="font-body text-[15px] py-2 flex justify-between items-center border-b border-list-border last:border-b-0"
            >
              <span>
                {pending.name}
                <span className="ml-2 font-sans text-[10px] uppercase tracking-[1px] text-text-muted">
                  Watching
                </span>
              </span>
            </li>
          ))}
        </ul>

        {/* ── Next game controls ───────────────────────────────── */}
        {isSpectator ? (
          /* Spectator — use setReady to signal they want to join next game,
             but also show the lobby button if one has been created */
          <div className="flex flex-col gap-3">
            {room.nextRoomCode ? (
              <Button variant="primary" onClick={handleJoinLobby}>
                Join Lobby →
              </Button>
            ) : (
              <Button
                variant={spectatorReady ? "primary" : "secondary"}
                onClick={() => {
                  const next = !spectatorReady;
                  setSpectatorReady(next);
                  setReady(next);
                }}
              >
                {spectatorReady
                  ? "Ready for Next Game \u2713"
                  : "Join Next Game"}
              </Button>
            )}
            {room.nextRoomCode && (
              <div className="border border-ink px-4 py-3 text-center">
                <p className="font-sans text-[10px] uppercase tracking-[2px] text-text-muted mb-1">
                  New Room Code
                </p>
                <p className="font-serif font-bold text-[22px] text-ink tracking-widest">
                  {room.nextRoomCode}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {room.nextRoomCode ? (
              /* Lobby already created — show join button + code */
              <>
                <Button variant="primary" onClick={handleJoinLobby}>
                  Join Lobby →
                </Button>
                <div className="border border-ink px-4 py-3 text-center">
                  <p className="font-sans text-[10px] uppercase tracking-[2px] text-text-muted mb-1">
                    New Room Code
                  </p>
                  <p className="font-serif font-bold text-[22px] text-ink tracking-widest">
                    {room.nextRoomCode}
                  </p>
                </div>
                <p className="font-body italic text-[13px] text-text-muted text-center">
                  Share this code so friends can join
                </p>
              </>
            ) : (
              /* No lobby yet — first person to click creates it */
              <>
                <Button
                  variant="secondary"
                  onClick={handleCreateLobby}
                >
                  {creatingLobby ? "Creating lobby\u2026" : "Play Again"}
                </Button>
                <p className="font-body italic text-[13px] text-text-muted text-center">
                  Start a fresh lobby &mdash; others can join with the new code
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
