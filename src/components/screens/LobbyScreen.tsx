"use client";

import { useRoom } from "@/lib/client/RoomContext";
import { trackEvent } from "@/lib/analytics";
import BlackletterHeading from "@/components/BlackletterHeading";
import GoldBar from "@/components/GoldBar";
import PlayerTag from "@/components/PlayerTag";
import Button from "@/components/Button";

export default function LobbyScreen() {
  const { room, isHost, startGame } = useRoom();

  if (!room) return null;

  const connectedPlayers = room.players.filter((p) => p.isConnected);
  const canStart = connectedPlayers.length >= 4;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6">
      <div
        className="flex flex-col items-center w-full"
        style={{ maxWidth: 420 }}
      >
        {/* Room code */}
        <BlackletterHeading size="78px" className="anim-title-in">
          <span
            className="gold-text"
            style={{ letterSpacing: "6px" }}
          >
            {room.code}
          </span>
        </BlackletterHeading>

        <div className="mt-6 anim-fade-in" style={{ opacity: 0, animationDelay: "0.2s", animationFillMode: "forwards" }}>
          <GoldBar />
        </div>

        {/* Player count */}
        <p
          className="mt-6 font-serif italic text-[18px] text-text-dim anim-fade-in"
          style={{ opacity: 0, animationDelay: "0.3s", animationFillMode: "forwards" }}
        >
          {connectedPlayers.length} player{connectedPlayers.length !== 1 ? "s" : ""}
        </p>

        {/* Player list */}
        <div
          className="flex flex-wrap justify-center gap-3 mt-6 anim-fade-in"
          style={{ opacity: 0, animationDelay: "0.4s", animationFillMode: "forwards" }}
        >
          {connectedPlayers.map((player) => (
            <PlayerTag
              key={player.id}
              name={player.name}
              isHost={player.isHost}
            />
          ))}
        </div>

        {/* Host controls / waiting message */}
        <div
          className="mt-10 w-full anim-fade-in"
          style={{ opacity: 0, animationDelay: "0.5s", animationFillMode: "forwards" }}
        >
          {isHost ? (
            <Button
              variant="primary"
              onClick={() => {
                trackEvent("game_started");
                startGame();
              }}
              disabled={!canStart}
              className="w-full"
            >
              {canStart
                ? "Start Game"
                : `Need ${4 - connectedPlayers.length} more`}
            </Button>
          ) : (
            <p className="text-center font-serif italic text-[17px] text-text-muted">
              waiting for the host&hellip;
            </p>
          )}
        </div>

        {/* Share hint */}
        <p
          className="mt-8 font-sans text-[12px] uppercase tracking-[4px] text-text-muted text-center anim-fade-in"
          style={{ opacity: 0, animationDelay: "0.6s", animationFillMode: "forwards" }}
        >
          Share the code to invite players
        </p>
      </div>
    </div>
  );
}
