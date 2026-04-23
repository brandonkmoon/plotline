"use client";

import { useRoom } from "@/lib/client/RoomContext";
import { trackEvent } from "@/lib/analytics";
import Button from "@/components/Button";
import PlayerTag from "@/components/PlayerTag";
import PendingPlayersBadge from "@/components/PendingPlayersBadge";

export default function LobbyScreen() {
  const { room, isHost, startGame, playerStatuses } = useRoom();

  if (!room) return null;

  const connectedPlayers = room?.players?.filter((p) => p.isConnected) ?? [];
  const canStart = connectedPlayers.length >= 4;

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
            style={{ fontSize: "clamp(32px, 12vw, 48px)", letterSpacing: "clamp(4px, 3vw, 10px)" }}
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
            onClick={() => {
              trackEvent("game_started");
              startGame();
            }}
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
        <p className="font-serif font-medium text-[14px] uppercase tracking-[3px] text-text-muted mb-4">
          Cast
        </p>
        <ul className="list-none mb-2">
          {(room?.players ?? []).map((player) => {
            const status = playerStatuses[player.id];
            return (
              <PlayerTag
                key={player.id}
                name={player.name}
                isHost={player.isHost}
                isReconnecting={status === "reconnecting"}
                isDisconnected={status === "disconnected"}
              />
            );
          })}
        </ul>

        <p className="font-sans text-[13px] text-text-muted text-center mt-1 mb-2">
          {connectedPlayers.length} player
          {connectedPlayers.length !== 1 ? "s" : ""}
        </p>
      </div>
      <PendingPlayersBadge />
    </>
  );
}
