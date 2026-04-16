"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRoom } from "@/lib/client/RoomContext";
import { trackEvent } from "@/lib/analytics";
import BlackletterHeading from "@/components/BlackletterHeading";
import GoldBar from "@/components/GoldBar";
import Button from "@/components/Button";

function joinNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

export default function EndScreen() {
  const {
    room,
    assembledStories,
    playAgain,
    newRoom,
    isHost,
    archiveUrl,
  } = useRoom();
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
    <div className="flex flex-col items-center justify-center min-h-screen px-6">
      <div
        className="flex flex-col items-center w-full"
        style={{ maxWidth: 420 }}
      >
        <BlackletterHeading size="56px" className="anim-title-in">
          <span className="gold-text">That&apos;s a wrap</span>
        </BlackletterHeading>

        <div
          className="mt-6 anim-fade-in"
          style={{
            opacity: 0,
            animationDelay: "0.2s",
            animationFillMode: "forwards",
          }}
        >
          <GoldBar />
        </div>

        {/* Summary */}
        <p
          className="mt-6 font-serif italic text-[18px] text-text-dim text-center anim-fade-in"
          style={{
            opacity: 0,
            animationDelay: "0.3s",
            animationFillMode: "forwards",
          }}
        >
          {storyCount} {storyCount === 1 ? "story" : "stories"} &middot;{" "}
          {playerCount} {playerCount === 1 ? "player" : "players"}
        </p>

        {/* Shareable link */}
        <div
          className="mt-8 w-full bg-surface border-2 border-border p-4 text-center anim-fade-in"
          style={{
            borderRadius: 0,
            opacity: 0,
            animationDelay: "0.4s",
            animationFillMode: "forwards",
          }}
        >
          <p className="font-sans text-[12px] uppercase tracking-[4px] text-text-muted mb-2">
            Share Link
          </p>
          {archiveUrl ? (
            <>
              <Link
                href={archiveUrl}
                className="font-sans text-[14px] text-gold hover:text-gold-light transition-colors underline underline-offset-4"
              >
                {fullArchiveUrl}
              </Link>
              <button
                onClick={handleCopy}
                className="mt-3 font-sans text-[12px] uppercase tracking-[3px] text-text-muted hover:text-text transition-colors"
              >
                {copied ? "Copied!" : "Copy Link"}
              </button>
            </>
          ) : (
            <p className="font-sans text-[14px] text-text-muted italic">
              Saving stories...
            </p>
          )}
        </div>

        {/* Buttons */}
        <div
          className="flex flex-col gap-4 w-full mt-8 anim-fade-in"
          style={{
            opacity: 0,
            animationDelay: "0.5s",
            animationFillMode: "forwards",
          }}
        >
          {isHost ? (
            <>
              <Button
                variant="primary"
                onClick={playAgain}
                className="w-full"
              >
                Next Round &mdash; Bring Back Everyone
              </Button>
              <Button
                variant="secondary"
                onClick={newRoom}
                className="w-full"
              >
                New Room Code
              </Button>
            </>
          ) : (
            <p className="font-serif italic text-[18px] text-text-dim text-center">
              Waiting for {hostName} to start the next round&hellip;
            </p>
          )}

          {readyPendingNames.length > 0 && (
            <p className="font-sans text-[13px] text-text-muted text-center">
              {joinNames(readyPendingNames)}{" "}
              {readyPendingNames.length === 1 ? "is" : "are"} ready to join next
              round
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
