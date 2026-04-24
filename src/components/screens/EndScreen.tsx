"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useRoom } from "@/lib/client/RoomContext";
import { trackEvent } from "@/lib/analytics";
import Button from "@/components/Button";
import PlayerList from "@/components/PlayerList";

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
  const [archived, setArchived] = useState(!!archiveUrl);

  useEffect(() => {
    trackEvent("game_completed");
  }, []);

  // Client-side archive fallback. If the PartyKit server's archive POST
  // failed (wrong URL, redirect, timeout, etc.), we archive directly from
  // the browser so the Save Image / Share features still work.
  useEffect(() => {
    if (archived || !room || assembledStories.length === 0) return;
    // Also treat archiveUrl arriving later (from server) as success
    if (archiveUrl) { setArchived(true); return; }

    const timer = setTimeout(async () => {
      try {
        const { serializeRoomForArchive } = await import(
          "@/lib/archive/serialize"
        );
        const data = serializeRoomForArchive(room);
        const res = await fetch("/api/archive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (res.ok) setArchived(true);
      } catch {
        // Best effort — if this also fails, Save Image won't work
      }
    }, 3000); // wait 3s for the server-side archive to arrive first

    return () => clearTimeout(timer);
  }, [archived, archiveUrl, room, assembledStories]);

  // Store our name + the previous host name for the new room so
  // AutoConnect can join with the right name and the server can
  // transfer host to the original host when they arrive.
  const storeNameForNextRoom = (nextCode: string) => {
    const name = currentPlayer?.name ?? currentPendingPlayer?.name ?? "";
    if (name) {
      try { sessionStorage.setItem(`plotline.nextJoin.${nextCode}`, name); } catch {}
    }
    const hostName = room?.players.find((p) => p.isHost)?.name ?? "";
    if (hostName) {
      try { sessionStorage.setItem(`plotline.prevHost.${nextCode}`, hostName); } catch {}
    }
  };

  // Once nextRoomCode appears after we triggered creation, navigate there
  useEffect(() => {
    if (creatingLobby && room?.nextRoomCode) {
      storeNameForNextRoom(room.nextRoomCode);
      router.push(`/room/${room.nextRoomCode}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    storeNameForNextRoom(room.nextRoomCode);
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
    if (!room?.code) return;
    trackEvent("save_story_card");
    window.open(`/api/og/${room.code}/${storyIndex}`, "_blank");
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
            {(room.revealOrder
              ? room.revealOrder.map((idx) => assembledStories.find((s) => s.storyIndex === idx)).filter(Boolean)
              : assembledStories
            ).map((story, i) => {
              if (!story) return null;
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
                        <button
                          onClick={() => handleSaveImage(story.storyIndex)}
                          className="font-sans text-[12px] uppercase tracking-[2px] text-text-dim hover:text-ink transition-colors"
                        >
                          {archived ? "Save Image ↗" : "Saving..."}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

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

        <PlayerList players={room.players} playerStatuses={playerStatuses} />
      </div>
    </div>
  );
}
