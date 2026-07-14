"use client";

import { useEffect } from "react";
import { useRoom } from "@/lib/client/RoomContext";
import { setHelpScreen } from "@/lib/helpContext";
import Button from "@/components/Button";
import PlayerList from "@/components/PlayerList";
import PendingPlayersBadge from "@/components/PendingPlayersBadge";

export default function WaitingScreen() {
  const {
    room,
    isHost,
    justBecameHost,
    advanceAvailable,
    hostAdvance,
    pendingConnected,
    pendingDisconnected,
    playerStatuses,
  } = useRoom();

  useEffect(() => {
    setHelpScreen("waiting");
  }, []);

  const totalPending = pendingConnected + pendingDisconnected;
  const connectedPlayers = room?.players.filter((p) => p.isConnected) ?? [];
  const submittedCount = connectedPlayers.filter(
    (p) => playerStatuses[p.id] === "submitted"
  ).length;

  return (
    <>
      <div className="screen anim-fade-in text-center">
        {justBecameHost && (
          <p
            role="status"
            aria-live="polite"
            className="font-sans text-[12px] uppercase tracking-[2px] text-white bg-ink px-4 py-2 text-center mb-4"
          >
            You&rsquo;re now the host
          </p>
        )}

        <hr className="rule" />
        <p className="font-serif font-medium text-[13px] uppercase tracking-[3px] text-text-muted mb-2">
          Between Acts
        </p>
        <h1 className="font-serif font-bold text-[24px] text-ink mb-1">
          Sit Tight
        </h1>
        <p className="font-sans text-[12px] text-text-muted mb-1" aria-live="polite">
          {submittedCount} of {connectedPlayers.length} submitted
        </p>

        {/* Submission dots */}
        <div className="flex justify-center gap-1.5 mb-4">
          {connectedPlayers.map((p) => (
            <div
              key={p.id}
              className="w-2 h-2 rounded-full transition-colors duration-300"
              style={{
                backgroundColor: playerStatuses[p.id] === "submitted" ? "#1a1a1a" : "#d0d0d0",
              }}
            />
          ))}
        </div>

        <hr className="rule" />

        {isHost && (advanceAvailable || pendingConnected === 0) && totalPending > 0 && (
          <div className="mb-4">
            <Button variant="secondary" onClick={hostAdvance}>
              {pendingConnected === 0
                ? `Advance (${pendingDisconnected} offline)`
                : pendingDisconnected === 0
                ? `Advance Now (${pendingConnected} still writing)`
                : `Advance (${pendingConnected} still writing, ${pendingDisconnected} offline)`}
            </Button>
          </div>
        )}

        <PlayerList players={room?.players ?? []} playerStatuses={playerStatuses} showSubmissionStatus />
      </div>
      <PendingPlayersBadge />
    </>
  );
}
