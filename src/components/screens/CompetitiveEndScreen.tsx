"use client";

import { useState } from "react";
import { useRoom } from "@/lib/client/RoomContext";
import Button from "@/components/Button";
import PlayerList from "@/components/PlayerList";
import type { SeriesAward, StoryVoteResult } from "@/lib/game/types";

function AwardCard({ award, index }: { award: SeriesAward; index: number }) {
  return (
    <div
      className="border-2 border-ink p-5 text-center mb-4 anim-fade-in"
      style={{ animationDelay: `${index * 300}ms`, opacity: 0, animationFillMode: "forwards" }}
    >
      <p className="font-serif font-medium text-[12px] uppercase tracking-[3px] text-text-muted mb-1">
        {award.title}
      </p>
      <p className="font-serif font-bold text-[24px] text-ink mb-1">
        {award.playerName}
      </p>
      {award.detail && (
        <p className="font-body italic text-[14px] text-text-dim mt-2">
          &ldquo;{award.detail}&rdquo;
        </p>
      )}
    </div>
  );
}

function ScoreRow({
  rank,
  name,
  points,
  isCurrentPlayer,
}: {
  rank: number;
  name: string;
  points: number;
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
      <span className="font-serif font-bold text-[18px] text-ink">
        {points}
      </span>
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
  } = useRoom();

  const [showAwards, setShowAwards] = useState(true);
  const [expandedStory, setExpandedStory] = useState<number | null>(null);

  if (!room || !gameScores) return null;

  const { scores, voteResults, gameNumber, seriesStandings } = gameScores;
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
    return (
      <div className="screen anim-fade-in">
        <p className="font-serif font-medium text-[13px] uppercase tracking-[3px] text-text-muted text-center mb-2">
          Awards Ceremony
        </p>
        <h1 className="font-serif font-bold text-[28px] text-ink text-center mb-2">
          Series Complete
        </h1>
        <p className="font-body italic text-[16px] text-text-dim text-center mb-6">
          {gameNumber} games played
        </p>

        <hr className="rule" />

        {awards.map((award, i) => (
          <AwardCard key={award.id} award={award} index={i} />
        ))}

        <div className="mt-6">
          <Button variant="primary" onClick={() => setShowAwards(false)}>
            See Scoreboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen anim-fade-in">
      <p className="font-serif font-medium text-[13px] uppercase tracking-[3px] text-text-muted text-center mb-2">
        {isFinalGame ? "Final Standings" : `Game ${gameNumber} of ${room.series?.totalGames ?? "?"}`}
      </p>
      <h1 className="font-serif font-bold text-[28px] text-ink text-center mb-1">
        Scoreboard
      </h1>

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
              &mdash; {scores.lineOfTheGame.authorName} ({scores.lineOfTheGame.voteCount} votes)
            </p>
          </div>
        </>
      )}

      <hr className="rule" />

      {/* Ranked scores */}
      <div className="mb-6">
        {sortedPlayers.map((player, i) => (
          <ScoreRow
            key={player.id}
            rank={i + 1}
            name={player.name}
            points={standings[player.id] ?? 0}
            isCurrentPlayer={player.id === currentPlayer?.id}
          />
        ))}
      </div>

      {/* This game's points (if not final, show both game + cumulative) */}
      {!isFinalGame && (
        <p className="font-sans text-[12px] text-text-muted text-center mb-4">
          This game: {Object.entries(scores.points)
            .filter(([, pts]) => pts > 0)
            .sort(([, a], [, b]) => b - a)
            .map(([id, pts]) => `${room.players.find((p) => p.id === id)?.name ?? "?"} +${pts}`)
            .join(", ")}
        </p>
      )}

      {/* Story cards with author names */}
      <p className="font-serif font-medium text-[14px] uppercase tracking-[3px] text-text-muted mb-4">
        Stories
      </p>
      {assembledStories.map((story, i) => {
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
                  Story {i + 1}
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
                  // Find who wrote this line
                  const slot = room.stories[story.storyIndex]?.slots[si];
                  const authorName = slot?.playerId
                    ? room.players.find((p) => p.id === slot.playerId)?.name ?? ""
                    : "";

                  return (
                    <div key={si} className="mb-2">
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
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <hr className="rule" />

      {/* Actions */}
      {isHost ? (
        <div className="flex flex-col gap-3">
          {isFinalGame ? (
            <Button variant="secondary" onClick={() => createNextRoom()}>
              New Series
            </Button>
          ) : (
            <Button variant="primary" onClick={() => {
              queueNextGame();
              playAgain();
            }}>
              Next Game ({gameNumber} of {room.series?.totalGames ?? "?"})
            </Button>
          )}
        </div>
      ) : (
        <p className="font-body italic text-[16px] text-text-dim text-center">
          Waiting for the host...
        </p>
      )}

      <PlayerList players={room.players} playerStatuses={playerStatuses} />
    </div>
  );
}
