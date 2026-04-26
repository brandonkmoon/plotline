"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useRoom } from "@/lib/client/RoomContext";
import { setHelpScreen } from "@/lib/helpContext";
import Button from "@/components/Button";
import PlayerList from "@/components/PlayerList";
import type { SeriesAward, StoryVoteResult } from "@/lib/game/types";

const AWARD_DESCRIPTIONS: Record<string, string> = {
  "casting-director": "Most points earned on character introductions.",
  "scene-stealer": "Most points earned on settings and actions.",
  "speechwriter": "Most points earned on dialogue lines.",
  "closer": "Most points earned on scene endings.",
  "fan-favorite": "Received the most standing ovations.",
  "popularity": "Appeared as a character in the most scenes.",
};

function AwardCard({ award, delay }: { award: SeriesAward; delay: number }) {
  const [showDetail, setShowDetail] = useState(false);
  const description = AWARD_DESCRIPTIONS[award.id];

  return (
    <div
      className="border-2 border-ink p-5 text-center mb-4 anim-fade-in cursor-pointer select-none"
      style={{ animationDelay: `${delay}ms`, opacity: 0, animationFillMode: "forwards" }}
      onClick={() => description && setShowDetail((v) => !v)}
    >
      <p className="font-serif font-medium text-[12px] uppercase tracking-[3px] mb-1" style={{ color: "var(--banner-text, #b8960c)" }}>
        {award.title}
      </p>
      <p className="font-serif font-bold text-[24px] text-ink mb-1">
        {award.playerName}
      </p>
      {showDetail && (
        <div className="mt-2">
          {description && (
            <p className="font-body italic text-[12px] text-text-dim">{description}</p>
          )}
          {award.detail && (
            <p className="font-sans text-[12px] text-text-muted mt-1">{award.detail}</p>
          )}
        </div>
      )}
      {description && !showDetail && (
        <p className="font-sans text-[10px] text-text-muted mt-1">tap for details</p>
      )}
    </div>
  );
}

function LineOfTheSeriesCard({ award, delay }: { award: SeriesAward; delay: number }) {
  return (
    <div
      className="border-l-2 pl-4 py-3 mb-4 anim-fade-in"
      style={{ borderLeftColor: "var(--banner)", animationDelay: `${delay}ms`, opacity: 0, animationFillMode: "forwards" }}
    >
      <p className="font-sans text-[10px] uppercase tracking-[2px] text-text-muted mb-1">
        Line of the Series
      </p>
      <p className="font-body italic text-[17px] text-ink leading-[1.5]">
        &ldquo;{award.detail}&rdquo;
      </p>
      <p className="font-sans text-[12px] text-text-dim mt-1">
        &mdash; {award.playerName}
      </p>
    </div>
  );
}

function ScoreRow({
  rank,
  name,
  points,
  gamePoints,
  isCurrentPlayer,
}: {
  rank: number;
  name: string;
  points: number;
  gamePoints?: number;
  isCurrentPlayer: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between py-3 border-b border-list-border last:border-b-0 ${
        isCurrentPlayer ? "bg-ink/5" : ""
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="font-serif font-bold text-[20px] text-ink w-8 text-center">
          {rank}
        </span>
        <span className="font-body text-[17px] text-ink">{name}</span>
      </div>
      <div className="flex items-center gap-2">
        {gamePoints !== undefined && gamePoints > 0 && (
          <span className="font-sans text-[11px] text-text-muted">+{gamePoints}</span>
        )}
        <span className="font-serif font-bold text-[18px] text-ink">
          {points}
        </span>
      </div>
    </div>
  );
}

export default function CompetitiveEndScreen() {
  const {
    room,
    assembledStories,
    currentPlayer,
    isHost,
    playerStatuses,
    gameScores,
    seriesAwards,
    createNextRoom,
    queueNextGame,
    playAgain,
    archiveUrl,
  } = useRoom();

  const router = useRouter();

  useEffect(() => {
    setHelpScreen("competitive-end");
  }, []);

  const [showAwards, setShowAwards] = useState(true);
  const [expandedStory, setExpandedStory] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [creatingLobby, setCreatingLobby] = useState(false);
  const READY_TIMER_SECONDS = 90;
  const [secondsLeft, setSecondsLeft] = useState(READY_TIMER_SECONDS);
  const timerExpired = secondsLeft <= 0;

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  // Scroll to top when awards ceremony appears
  useEffect(() => {
    if (seriesAwards?.awards?.length) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [seriesAwards]);

  // Auto-navigate when new lobby is created (same as classic EndScreen)
  useEffect(() => {
    if (creatingLobby && room?.nextRoomCode) {
      const name = currentPlayer?.name ?? "";
      if (name) {
        try { sessionStorage.setItem(`plotline.nextJoin.${room.nextRoomCode}`, name); } catch {}
      }
      router.push(`/room/${room.nextRoomCode}`);
    }
  }, [creatingLobby, room?.nextRoomCode, router, currentPlayer]);

  const handleCreateLobby = () => {
    if (creatingLobby) return;
    setCreatingLobby(true);
    createNextRoom();
  };

  const handleJoinLobby = () => {
    if (!room?.nextRoomCode) return;
    const name = currentPlayer?.name ?? "";
    if (name) {
      try { sessionStorage.setItem(`plotline.nextJoin.${room.nextRoomCode}`, name); } catch {}
    }
    router.push(`/room/${room.nextRoomCode}`);
  };

  const handleShare = (story: { storyIndex: number; title?: string; sections?: { text: string }[] }) => {
    const full = archiveUrl
      ? (archiveUrl.startsWith("http") ? archiveUrl : `${window.location.origin}${archiveUrl}`)
      : null;
    const storyText = story.sections?.map((s) => s.text).join("\n\n") ?? "";
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({
        title: story.title ?? "A Plotline scene",
        text: `"${story.title}" — a scene from Plotline\n\n${storyText}`,
        ...(full ? { url: full } : {}),
      }).catch(() => {});
    } else {
      const toCopy = full ?? storyText;
      navigator.clipboard.writeText(toCopy).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  const [savingImage, setSavingImage] = useState<number | null>(null);

  const handleSaveImage = async (storyIndex: number) => {
    if (!room?.code || savingImage !== null) return;
    setSavingImage(storyIndex);
    try {
      const res = await fetch(`/api/og/${room.code}/${storyIndex}`);
      if (!res.ok) throw new Error("not ready");
      const blob = await res.blob();
      const file = new File([blob], `plotline-story-${storyIndex + 1}.png`, { type: "image/png" });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      window.open(`/api/og/${room.code}/${storyIndex}`, "_blank");
    } finally {
      setSavingImage(null);
    }
  };

  if (!room || !gameScores) return null;

  const { scores, voteResults, gameNumber, seriesStandings } = gameScores;

  // Compute points per line for each story
  const linePointsByStory: Record<number, number[]> = {};
  for (const result of voteResults) {
    const pts = new Array(7).fill(0);
    for (const vote of result.votes) {
      pts[vote.lineIndex] += vote.isStandingOvation ? 3 : 1;
    }
    linePointsByStory[result.storyIndex] = pts;
  }
  const isFinalGame = room.series
    ? gameNumber >= room.series.totalGames
    : false;
  const awards = seriesAwards?.awards ?? [];
  const standings = isFinalGame
    ? seriesAwards?.finalStandings ?? seriesStandings
    : seriesStandings;

  // Sort players by points (descending)
  const sortedPlayers = [...room.players]
    .filter((p) => p.isConnected)
    .sort((a, b) => (standings[b.id] ?? 0) - (standings[a.id] ?? 0));

  // If final game and awards exist and we haven't dismissed them yet, show ceremony
  if (isFinalGame && awards.length > 0 && showAwards) {
    const podium = sortedPlayers.slice(0, 3);
    const winner = podium[0];
    const runnerUp = podium[1];
    const thirdPlace = podium[2];

    const lineAward = awards.find((a) => a.id === "line-of-the-series");
    const otherAwards = awards.filter((a) => a.id !== "line-of-the-series");

    return (
      <div className="screen anim-fade-in">
        <p className="font-serif font-medium text-[13px] uppercase tracking-[3px] text-text-muted text-center mb-1">
          The Final Curtain
        </p>
        <p className="font-body italic text-[14px] text-text-dim text-center mb-6">
          The votes are in.
        </p>

        {/* Winner — yellow marquee */}
        {winner && (
          <div
            className="text-center py-5 px-4 mb-4 anim-fade-in"
            style={{
              background: "var(--banner)",
              border: "2px solid var(--ink)",
              animationDelay: "300ms",
              opacity: 0,
              animationFillMode: "forwards",
            }}
          >
            <p className="font-sans text-[11px] uppercase tracking-[3px] text-ink/50 mb-2">
              Winner
            </p>
            <h1 className="font-serif font-bold text-ink mb-1" style={{ fontSize: "clamp(28px, 8vw, 40px)" }}>
              &#9733; {winner.name} &#9733;
            </h1>
            <p className="font-serif font-bold text-[20px] text-ink">
              {standings[winner.id] ?? 0} pts
            </p>
          </div>
        )}

        {/* Runner-Up & Third */}
        {(runnerUp || thirdPlace) && (
          <div className="flex justify-center gap-8 mb-2 anim-fade-in" style={{ animationDelay: "800ms", opacity: 0, animationFillMode: "forwards" }}>
            {runnerUp && (
              <div className="text-center">
                <p className="font-sans text-[10px] uppercase tracking-[2px] text-text-muted mb-1">Runner-Up</p>
                <p className="font-serif font-bold text-[18px] text-ink">{runnerUp.name}</p>
                <p className="font-sans text-[13px] text-text-dim">{standings[runnerUp.id] ?? 0} pts</p>
              </div>
            )}
            {thirdPlace && (
              <div className="text-center">
                <p className="font-sans text-[10px] uppercase tracking-[2px] text-text-muted mb-1">Third</p>
                <p className="font-serif font-bold text-[18px] text-ink">{thirdPlace.name}</p>
                <p className="font-sans text-[13px] text-text-dim">{standings[thirdPlace.id] ?? 0} pts</p>
              </div>
            )}
          </div>
        )}

        {/* 4th place onward */}
        {sortedPlayers.length > 3 && (
          <div className="mt-2 mb-2 anim-fade-in" style={{ animationDelay: "1000ms", opacity: 0, animationFillMode: "forwards" }}>
            {sortedPlayers.slice(3).map((player, i) => (
              <ScoreRow
                key={player.id}
                rank={i + 4}
                name={player.name}
                points={standings[player.id] ?? 0}
                isCurrentPlayer={player.id === currentPlayer?.id}
              />
            ))}
          </div>
        )}

        <hr className="rule" />

        {/* Line of the Series — special treatment */}
        {lineAward && (
          <LineOfTheSeriesCard award={lineAward} delay={1300} />
        )}

        {/* Other awards */}
        {otherAwards.map((award, i) => (
          <AwardCard key={award.id} award={award} delay={1600 + i * 400} />
        ))}

        {/* Closing line */}
        <p className="font-body italic text-[15px] text-text-dim text-center mt-4 mb-6 anim-fade-in"
          style={{ animationDelay: `${1600 + otherAwards.length * 400 + 300}ms`, opacity: 0, animationFillMode: "forwards" }}
        >
          Take a bow, everyone.
        </p>

        <hr className="rule" />

        {/* Play again */}
        <div className="flex flex-col gap-3">
          {room.nextRoomCode ? (
            <>
              <Button variant="primary" onClick={handleJoinLobby}>
                Join Lobby &rarr;
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
            <>
              <Button variant="secondary" onClick={handleCreateLobby}>
                {creatingLobby ? "Creating lobby\u2026" : "Play Again"}
              </Button>
              <p className="font-body italic text-[13px] text-text-muted text-center">
                Start a fresh lobby &mdash; others can join with the new code
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  // Find this game's top performer
  const topPerformerEntry = Object.entries(scores.points)
    .sort(([, a], [, b]) => b - a)[0];
  const topPerformerId = topPerformerEntry?.[0];
  const topPerformerPts = topPerformerEntry?.[1] ?? 0;
  const topPerformerName = room.players.find((p) => p.id === topPerformerId)?.name ?? "";

  return (
    <div className="screen anim-fade-in">
      <p className="font-serif font-medium text-[13px] uppercase tracking-[3px] text-text-muted text-center mb-1">
        Intermission
      </p>
      <p className="font-body italic text-[14px] text-text-dim text-center mb-1">
        The scores so far.
      </p>
      <p className="font-sans text-[11px] uppercase tracking-[2px] text-text-muted text-center mb-4">
        Game {gameNumber} of {room.series?.totalGames ?? "?"}
      </p>

      {/* Top Performer this game */}
      {topPerformerName && topPerformerPts > 0 && (
        <div className="text-center border-2 border-ink py-3 px-4 mb-2">
          <p className="font-sans text-[10px] uppercase tracking-[2px] text-text-muted mb-1">
            Top Performer
          </p>
          <p className="font-serif font-bold text-[22px] text-ink">
            {topPerformerName}
          </p>
          <p className="font-sans text-[12px] text-text-dim">
            +{topPerformerPts} pts this game
          </p>
        </div>
      )}

      {/* Line of the Game */}
      {scores.lineOfTheGame && (
        <>
          <hr className="rule" />
          <div className="border-l-2 border-l-banner pl-4 py-2 mb-2">
            <p className="font-sans text-[10px] uppercase tracking-[2px] text-text-muted mb-1">
              Line of the Game
            </p>
            <p className="font-body italic text-[17px] text-ink leading-[1.5]">
              &ldquo;{scores.lineOfTheGame.text}&rdquo;
            </p>
            <p className="font-sans text-[12px] text-text-dim mt-1">
              &mdash; {scores.lineOfTheGame.authorName} ({scores.lineOfTheGame.points} pts)
            </p>
          </div>
        </>
      )}

      <hr className="rule" />

      {/* Ranked scores with inline +pts */}
      <div className="mb-4">
        {sortedPlayers.map((player, i) => (
          <ScoreRow
            key={player.id}
            rank={i + 1}
            name={player.name}
            points={standings[player.id] ?? 0}
            gamePoints={!isFinalGame ? scores.points[player.id] : undefined}
            isCurrentPlayer={player.id === currentPlayer?.id}
          />
        ))}
      </div>

      {/* Scene cards with author names */}
      <p className="font-serif font-medium text-[14px] uppercase tracking-[3px] text-text-muted mb-4">
        Scenes
      </p>
      {(room.revealOrder
        ? room.revealOrder.map((idx) => assembledStories.find((s) => s.storyIndex === idx)).filter(Boolean)
        : assembledStories
      ).map((story, i) => {
        if (!story) return null;
        const isExpanded = expandedStory === i;
        return (
          <div key={story.storyIndex} style={{ marginTop: i === 0 ? 0 : 8 }}>
            <button
              onClick={() => setExpandedStory(isExpanded ? null : i)}
              className="w-full text-left px-4 py-3 flex items-center justify-between border border-ink"
              style={{ background: "var(--banner)" }}
            >
              <div className="flex flex-col pr-4">
                <span className="font-sans text-[10px] uppercase tracking-[2px] mb-0.5" style={{ color: "rgba(26,26,26,0.5)" }}>
                  Scene {i + 1}
                </span>
                <span className="font-serif font-bold text-[15px] text-ink leading-snug">
                  {story.title}
                </span>
              </div>
              <span className="font-sans text-[16px] text-ink flex-shrink-0">
                {isExpanded ? "↑" : "↓"}
              </span>
            </button>

            {isExpanded && (
              <div className="border border-t-0 border-ink bg-white px-4 pb-5 pt-4">
                {story.sections.map((section, si) => {
                  const slot = room.stories[story.storyIndex]?.slots[si];
                  const authorName = slot?.playerId
                    ? room.players.find((p) => p.id === slot.playerId)?.name ?? ""
                    : "";
                  const pts = linePointsByStory[story.storyIndex]?.[si] ?? 0;

                  return (
                    <div key={si} className="mb-3 flex gap-3 items-start">
                      <div className="flex-1">
                        <p
                          className={`font-body text-[17px] leading-[1.6] ${
                            section.style === "dialogue" ? "italic" : ""
                          } text-ink`}
                        >
                          {section.text}
                        </p>
                        {authorName && (
                          <p className="font-sans text-[11px] text-text-muted mt-0.5">
                            — {authorName}
                          </p>
                        )}
                      </div>
                      {pts > 0 && (
                        <span className="font-sans text-[11px] font-semibold text-ink bg-banner px-2 py-0.5 shrink-0 mt-1">
                          {pts} pt{pts !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  );
                })}

                <hr className="border-t border-ink/20 mb-4 mt-2" />
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => handleShare(story)}
                    className="font-sans text-[12px] uppercase tracking-[2px] text-ink hover:text-text-dim transition-colors"
                  >
                    Share Scene ↗
                  </button>
                  <button
                    onClick={() => handleSaveImage(story.storyIndex)}
                    className="font-sans text-[12px] uppercase tracking-[2px] text-text-dim hover:text-ink transition-colors"
                  >
                    {savingImage === story.storyIndex ? "Saving..." : "Share Image ↗"}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <hr className="rule" />

      {/* Closing line */}
      {!isFinalGame && (
        <p className="font-body italic text-[15px] text-text-dim text-center mb-6">
          On to the next act.
        </p>
      )}

      {/* Ready flow */}
      {(() => {
        const connectedPlayers = room.players.filter((p) => p.isConnected);
        const readyCount = connectedPlayers.filter((p) => p.queuedForNextGame).length;
        const isReady = currentPlayer?.queuedForNextGame;

        return (
          <>
            <div className="text-center mb-4">
              {!isReady ? (
                <Button variant="primary" onClick={() => queueNextGame()}>
                  Ready
                </Button>
              ) : (
                <p className="font-sans text-[13px] text-text-muted">
                  &#10003; You&rsquo;re ready
                </p>
              )}

              <p className="font-sans text-[12px] text-text-muted mt-3">
                {readyCount}/{connectedPlayers.length} ready
                {!timerExpired && (
                  <span className="ml-2">
                    &middot; auto-advance in {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
                  </span>
                )}
              </p>
            </div>

            {timerExpired && isHost && (
              <Button variant="secondary" onClick={() => playAgain()}>
                {isFinalGame ? "Show Awards" : `Start Game ${gameNumber + 1} of ${room.series?.totalGames ?? "?"}`}
              </Button>
            )}

            {timerExpired && !isHost && (
              <p className="font-body italic text-[14px] text-text-muted text-center">
                Waiting for the host&hellip;
              </p>
            )}
          </>
        );
      })()}

      <PlayerList players={room.players} playerStatuses={playerStatuses} />
    </div>
  );
}
