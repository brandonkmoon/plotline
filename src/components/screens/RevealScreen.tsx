"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRoom } from "@/lib/client/RoomContext";
import Button from "@/components/Button";
import PendingPlayersBadge from "@/components/PendingPlayersBadge";

const SECTIONS_PER_STORY = 7;
const TRANSITION_MS = 2000;

function PlayerConnectionList({
  players,
  playerStatuses,
  readerId,
}: {
  players: { id: string; name: string; isHost: boolean }[];
  playerStatuses: Record<string, string>;
  readerId?: string;
}) {
  return (
    <ul className="w-full mt-6 list-none">
      {players.map((player) => {
        const status = playerStatuses[player.id];
        const isDisconnected = status === "disconnected";
        const isReconnecting = status === "reconnecting";
        const isReader = player.id === readerId;
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
              {isReader && (
                <span className="ml-2 font-sans text-[10px] font-semibold uppercase tracking-[1px] bg-ink text-white px-2 py-[1px] rounded-[3px]">
                  Reading
                </span>
              )}
              {player.isHost && !isReader && (
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
              <span className="font-sans text-[12px] text-text-muted">
                offline
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function RevealScreen() {
  const {
    assembledStories,
    advanceReveal,
    revealState,
    revealAdvance,
    nextStory,
    currentPlayer,
    isHost,
    justBecameHost,
    playerStatuses,
    room,
  } = useRoom();

  const [localStoryIdx, setLocalStoryIdx] = useState(0);
  const [localRevealedLines, setLocalRevealedLines] = useState(0);

  const usingSyncedReveal = revealState !== null;

  const totalStories = assembledStories?.length ?? 0;
  const currentStoryIdx = usingSyncedReveal
    ? revealState.storyIndex
    : localStoryIdx;
  const revealedLines = usingSyncedReveal
    ? revealState.revealedCount
    : localRevealedLines;

  const story = assembledStories[currentStoryIdx];
  const totalLines = story?.sections?.length ?? SECTIONS_PER_STORY;
  const allRevealed = story ? revealedLines >= totalLines : false;

  // If the designated reader has disconnected, the host steps in so the
  // reveal doesn't get stuck.
  const readerPlayer = usingSyncedReveal
    ? room?.players.find((p) => p.id === revealState.readerId)
    : null;
  const readerIsOffline =
    usingSyncedReveal && readerPlayer ? !readerPlayer.isConnected : false;
  const isHostFallbackReader =
    readerIsOffline && currentPlayer?.id === room?.hostId;

  // Spectators (pending players) have no currentPlayer — they are never readers.
  // In local (non-synced) mode everyone controls the reveal themselves.
  const isReader = usingSyncedReveal
    ? !!currentPlayer &&
      (currentPlayer.id === revealState.readerId || isHostFallbackReader)
    : true;

  const readerName = usingSyncedReveal
    ? revealState.readerName
    : story?.readerName ?? "someone";

  const [transitioning, setTransitioning] = useState(false);
  const [nextReaderName, setNextReaderName] = useState<string | null>(null);
  const [nextStoryNumber, setNextStoryNumber] = useState<number | null>(null);
  const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  useEffect(() => {
    return () => {
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
      }
    };
  }, []);

  const handleTap = useCallback(() => {
    if (!story) return;
    if (!isReader) return;
    if (revealedLines >= SECTIONS_PER_STORY) return;
    if (usingSyncedReveal) {
      revealAdvance();
    } else {
      setLocalRevealedLines((prev) => Math.min(prev + 1, SECTIONS_PER_STORY));
    }
  }, [story, isReader, revealedLines, usingSyncedReveal, revealAdvance]);

  // Count already-revealed stories from game state (not by index, since
  // reveal order is now shuffled). If every story except the current one
  // is revealed, this is the last.
  const storiesAlreadyRevealed =
    room?.stories?.filter((s) => s.isRevealed).length ?? 0;
  const isFinalStory = storiesAlreadyRevealed >= totalStories - 1;

  const handleNextStory = useCallback(() => {
    if (!assembledStories) return;

    if (usingSyncedReveal) {
      if (!isFinalStory) {
        setNextReaderName(null); // server will tell us
        setNextStoryNumber(storiesAlreadyRevealed + 2);
        setTransitioning(true);
        if (transitionTimeoutRef.current) {
          clearTimeout(transitionTimeoutRef.current);
        }
        transitionTimeoutRef.current = setTimeout(() => {
          setTransitioning(false);
          setNextReaderName(null);
          setNextStoryNumber(null);
        }, TRANSITION_MS);
      }
      nextStory();
    } else {
      if (localStoryIdx < totalStories - 1) {
        setLocalStoryIdx((prev) => prev + 1);
        setLocalRevealedLines(0);
      } else {
        advanceReveal();
      }
    }
  }, [
    usingSyncedReveal,
    nextStory,
    localStoryIdx,
    totalStories,
    advanceReveal,
    assembledStories,
    isFinalStory,
    storiesAlreadyRevealed,
  ]);

  if (!story || !room) return null;

  // ── Transition card (between stories) ────────────────────
  if (transitioning && nextStoryNumber !== null) {
    return (
      <>
        <div className="screen text-center anim-fade-in">
          <p className="font-serif font-medium text-[13px] uppercase tracking-[3px] text-text-muted mb-2">
            Up Next
          </p>
          <h1 className="font-serif font-bold text-[24px] text-ink mb-1">
            Story {nextStoryNumber} of {totalStories}
          </h1>
          <p className="font-body italic text-[16px] text-text-dim">
            {nextReaderName
              ? `${nextReaderName} will read the next story aloud`
              : "Get ready for the next story"}
          </p>
        </div>
        <PendingPlayersBadge />
      </>
    );
  }

  // ── Non-reader view ───────────────────────────────────────
  if (!isReader && usingSyncedReveal) {
    return (
      <>
        <div className="screen anim-fade-in">
          {justBecameHost && (
            <p className="font-sans text-[12px] uppercase tracking-[2px] text-white bg-ink px-4 py-2 text-center mb-4">
              You&rsquo;re now the host
            </p>
          )}
          <hr className="rule" />
          <p className="font-serif font-medium text-[13px] uppercase tracking-[3px] text-text-muted text-center mb-2">
            Now Playing
          </p>
          <h1 className="font-serif font-bold text-[24px] text-ink text-center mb-1">
            Story {currentStoryIdx + 1} of {totalStories}
          </h1>
          {story.title && (
            <p className="font-serif font-bold text-[21px] text-ink text-center mb-1">
              &ldquo;{story.title}&rdquo;
            </p>
          )}
          <p className="font-body italic text-[16px] text-text-dim text-center mb-6">
            Read by {readerName}
          </p>
          <hr className="rule" />

          <p className="mt-6 font-body italic text-[16px] text-text-muted text-center">
            Listening&hellip;
          </p>

          {isHost && (
            <div className="mt-6">
              <Button variant="secondary" onClick={() => advanceReveal()}>
                Skip Story &rarr;
              </Button>
            </div>
          )}

          <PlayerConnectionList players={room.players} playerStatuses={playerStatuses} readerId={usingSyncedReveal ? revealState.readerId : undefined} />
        </div>
        <PendingPlayersBadge />
      </>
    );
  }

  // ── Reader view ──────────────────────────────────────────

  return (
    <>
      <div
        className="screen cursor-pointer select-none anim-fade-in"
        onClick={!allRevealed ? handleTap : undefined}
      >
        {justBecameHost && (
          <p className="font-sans text-[12px] uppercase tracking-[2px] text-white bg-ink px-4 py-2 text-center mb-4">
            You&rsquo;re now the host
          </p>
        )}

        <hr className="rule" />

        <p className="font-serif font-medium text-[13px] uppercase tracking-[3px] text-text-muted text-center mb-2">
          Now Playing
        </p>
        <h1 className="font-serif font-bold text-[24px] text-ink text-center mb-1">
          Story {currentStoryIdx + 1} of {totalStories}
        </h1>
        {story.title && (
          <p className="font-serif font-bold text-[21px] text-ink text-center mb-1">
            &ldquo;{story.title}&rdquo;
          </p>
        )}
        <p className="font-body italic text-[16px] text-text-dim text-center mb-1">
          Read by {readerName}
        </p>
        <p className="font-body italic text-[16px] text-text-muted text-center mb-6">
          {isHostFallbackReader
            ? `${readerName} is offline \u2014 you\u2019re reading`
            : "Your turn \u2014 read this aloud"}
        </p>

        <hr className="rule" />

        {revealedLines === 0 && (
          <p className="font-body italic text-[14px] text-text-muted text-center mt-4 mb-2">
            Tap anywhere to reveal each line one at a time.
          </p>
        )}

        <div className="mt-2 space-y-3">
          {(story?.sections ?? []).map((section, i) => {
            if (i >= revealedLines) return null;
            const isDialogue = section.style === "dialogue";
            const isNewest = i === revealedLines - 1;

            return (
              <p
                key={i}
                className={`font-body text-[18px] text-ink leading-[1.7] pl-4 border-l-2 ${
                  isDialogue ? "italic" : ""
                } ${isNewest ? "line-reveal-anim" : ""}`}
                style={{ borderLeftColor: "#FCEB00" }}
              >
                {section.text}
              </p>
            );
          })}

          {!allRevealed && (() => {
            const next = story.sections[revealedLines];
            if (!next) return null;
            return (
              <div className="line-preview">
                <p
                  className={`line-preview-text font-body text-[18px] leading-[1.7] pl-4 border-l-2 ${
                    next.style === "dialogue" ? "italic" : ""
                  }`}
                  style={{ borderLeftColor: "#e0e0e0" }}
                >
                  {next.text}
                </p>
              </div>
            );
          })()}
        </div>

        {allRevealed && (
          <div className="mt-8">
            <Button variant="secondary" onClick={handleNextStory}>
              {isFinalStory ? "That\u2019s a Wrap \u2192" : "Next Story \u2192"}
            </Button>
          </div>
        )}

        <PlayerConnectionList players={room.players} playerStatuses={playerStatuses} />
      </div>
      <PendingPlayersBadge />
    </>
  );
}
