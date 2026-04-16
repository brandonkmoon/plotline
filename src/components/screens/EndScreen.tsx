"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRoom } from "@/lib/client/RoomContext";
import { trackEvent } from "@/lib/analytics";
import Button from "@/components/Button";

function joinNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

export default function EndScreen() {
  const { room, assembledStories, playAgain, newRoom, isHost, archiveUrl } =
    useRoom();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    trackEvent("game_completed");
  }, []);

  if (!room) return null;

  const playerCount = room?.players?.filter((p) => p.isConnected)?.length ?? 0;
  const storyCount = assembledStories?.length ?? 0;
  const pending = room?.pendingPlayers ?? [];
  const readyPendingNames = pending.filter((p) => p.ready).map((p) => p.name);
  const hostName = room.players.find((p) => p.isHost)?.name ?? "the host";

  const fullArchiveUrl = archiveUrl
    ? `${window.location.origin}${archiveUrl}`
    : null;

  const handleCopy = () => {
    if (!fullArchiveUrl) return;
    trackEvent("copy_archive_link");
    navigator.clipboard.writeText(fullArchiveUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="screen text-center anim-fade-in">
      <p className="font-serif font-medium text-[13px] uppercase tracking-[3px] text-text-muted mb-2">
        Curtain Call
      </p>
      <h1 className="font-serif font-bold text-[28px] text-ink mb-1">
        That&apos;s a Wrap
      </h1>
      <p className="font-body italic text-[16px] text-text-dim">
        {storyCount} {storyCount === 1 ? "story" : "stories"} &middot;{" "}
        {playerCount} {playerCount === 1 ? "player" : "players"}
      </p>

      <hr className="rule" />

      {/* Share link */}
      <div className="border border-ink p-4 text-left">
        <p className="font-serif font-medium text-[12px] uppercase tracking-[2px] text-text-dim mb-2">
          Share Link
        </p>
        {archiveUrl ? (
          <>
            <Link
              href={archiveUrl}
              className="font-sans text-[13px] text-ink underline underline-offset-4 break-all"
            >
              {fullArchiveUrl}
            </Link>
            <button
              onClick={handleCopy}
              className="mt-3 font-sans text-[12px] uppercase tracking-[2px] text-text-dim hover:text-ink transition-colors block"
            >
              {copied ? "Copied!" : "Copy Link"}
            </button>
          </>
        ) : (
          <p className="font-body italic text-[14px] text-text-muted">
            Saving stories&hellip;
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 mt-8">
        {isHost ? (
          <>
            <Button variant="primary" onClick={playAgain}>
              Play Again
            </Button>
            <Button variant="secondary" onClick={newRoom}>
              New Room Code
            </Button>
          </>
        ) : (
          <p className="font-body italic text-[16px] text-text-dim">
            Waiting for {hostName} to start the next round&hellip;
          </p>
        )}

        {readyPendingNames.length > 0 && (
          <p className="font-sans text-[13px] text-text-muted">
            {joinNames(readyPendingNames)}{" "}
            {readyPendingNames.length === 1 ? "is" : "are"} ready to join next
            round
          </p>
        )}
      </div>
    </div>
  );
}
