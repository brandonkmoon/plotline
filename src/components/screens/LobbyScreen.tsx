"use client";

import { useState } from "react";
import { useRoom } from "@/lib/client/RoomContext";
import { trackEvent } from "@/lib/analytics";
import Button from "@/components/Button";
import PlayerList from "@/components/PlayerList";
import PendingPlayersBadge from "@/components/PendingPlayersBadge";

function ModeSheet({
  onStart,
  onClose,
}: {
  onStart: (mode: "classic" | "competitive", seriesLength?: 3 | 5) => void;
  onClose: () => void;
}) {
  const [seriesLength, setSeriesLength] = useState<3 | 5>(3);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50">
      <div
        className="bg-white border-t-[3px] border-ink w-full max-w-[480px] p-6 pb-10"
        style={{ animation: "helpSlideUp 0.3s ease-out" }}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-ink text-[24px] p-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          ✕
        </button>

        <p className="font-serif font-bold text-[18px] text-ink text-center uppercase tracking-[3px] mb-6">
          How Do You Want to Play?
        </p>

        {/* Classic */}
        <button
          onClick={() => onStart("classic")}
          className="w-full text-left border-2 border-ink p-4 mb-3 hover:bg-ink hover:text-white transition-colors group"
        >
          <span className="font-serif font-bold text-[16px] uppercase tracking-[2px] block">
            Classic
          </span>
          <span className="font-body italic text-[14px] text-text-dim group-hover:text-white/70 block mt-1">
            Just the stories. No scoring.
          </span>
        </button>

        {/* Competitive */}
        <div className="border-2 border-ink p-4">
          <span className="font-serif font-bold text-[16px] uppercase tracking-[2px] block text-ink">
            Competitive Series
          </span>
          <span className="font-body italic text-[14px] text-text-dim block mt-1">
            Vote on the best lines. Points, awards, a winner.
          </span>

          {/* Series length picker */}
          <div className="flex gap-3 mt-4 mb-4">
            <button
              onClick={() => setSeriesLength(3)}
              className={`flex-1 py-2 font-sans text-[13px] uppercase tracking-[2px] border-2 transition-colors ${
                seriesLength === 3
                  ? "bg-ink text-white border-ink"
                  : "bg-transparent text-ink border-ink hover:bg-ink/5"
              }`}
            >
              3 Games
            </button>
            <button
              onClick={() => setSeriesLength(5)}
              className={`flex-1 py-2 font-sans text-[13px] uppercase tracking-[2px] border-2 transition-colors ${
                seriesLength === 5
                  ? "bg-ink text-white border-ink"
                  : "bg-transparent text-ink border-ink hover:bg-ink/5"
              }`}
            >
              5 Games
            </button>
          </div>

          <Button
            variant="primary"
            onClick={() => onStart("competitive", seriesLength)}
          >
            Start Series
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function LobbyScreen() {
  const { room, isHost, startGame, playerStatuses } = useRoom();
  const [showModeSheet, setShowModeSheet] = useState(false);

  if (!room) return null;

  const connectedPlayers = room?.players?.filter((p) => p.isConnected) ?? [];
  const canStart = connectedPlayers.length >= 4;

  const handleStart = (
    mode: "classic" | "competitive",
    seriesLength?: 3 | 5
  ) => {
    setShowModeSheet(false);
    trackEvent(mode === "competitive" ? "series_started" : "game_started");
    startGame(mode, seriesLength);
  };

  return (
    <>
      <div className="screen anim-fade-in">
        {/* Room code */}
        <div className="text-center mb-6">
          <p className="font-body text-[13px] uppercase tracking-[2px] text-text-dim mb-2">
            Room Code
          </p>
          <p
            className="font-serif font-bold text-ink"
            style={{
              fontSize: "clamp(32px, 12vw, 48px)",
              letterSpacing: "clamp(4px, 3vw, 10px)",
            }}
          >
            {room.code}
          </p>
        </div>

        <hr className="rule" />

        <p className="font-body italic text-[14px] text-text-muted text-center mb-6">
          Share the room code to invite more players
        </p>

        {isHost ? (
          <Button
            variant="primary"
            onClick={() => (canStart ? setShowModeSheet(true) : undefined)}
            disabled={!canStart}
          >
            {canStart
              ? "Start the Show"
              : `Need ${4 - connectedPlayers.length} More`}
          </Button>
        ) : (
          <p className="text-center font-body italic text-[16px] text-text-muted">
            waiting for the host&hellip;
          </p>
        )}

        <hr className="rule" />

        {/* Cast */}
        <p className="font-serif font-medium text-[14px] uppercase tracking-[3px] text-text-muted mb-[-16px]">
          Cast
        </p>
        <PlayerList
          players={room?.players ?? []}
          playerStatuses={playerStatuses}
        />

        <p className="font-sans text-[13px] text-text-muted text-center mt-2 mb-2">
          {connectedPlayers.length} player
          {connectedPlayers.length !== 1 ? "s" : ""}
        </p>
      </div>

      {showModeSheet && (
        <ModeSheet
          onStart={handleStart}
          onClose={() => setShowModeSheet(false)}
        />
      )}

      <PendingPlayersBadge />
    </>
  );
}
