"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { RoomProvider, useRoom } from "@/lib/client/RoomContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import ConnectionStatus from "@/components/ConnectionStatus";
import LobbyScreen from "@/components/screens/LobbyScreen";
import PromptScreen from "@/components/screens/PromptScreen";
import WaitingScreen from "@/components/screens/WaitingScreen";
import RevealScreen from "@/components/screens/RevealScreen";
import VotingScreen from "@/components/screens/VotingScreen";
import EndScreen from "@/components/screens/EndScreen";
import CompetitiveEndScreen from "@/components/screens/CompetitiveEndScreen";
import SpectatorScreen from "@/components/screens/SpectatorScreen";
import Button from "@/components/Button";
import { gameClient } from "@/lib/multiplayer/gameClient";
import { registerLeaveGuard, clearLeaveGuard } from "@/lib/client/leaveGuard";

// Small room-code badge overlaid on the banner — always visible so players
// can share the code at any point during the game.
function RoomCodeBadge() {
  const { room } = useRoom();
  const [flash, setFlash] = useState(false);

  if (!room?.code) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(room.code).then(() => {
      setFlash(true);
      setTimeout(() => setFlash(false), 1200);
    });
  };

  return (
    <button
      onClick={handleCopy}
      aria-label="Copy room code"
      style={{
        position: "fixed",
        top: 12,
        right: 14,
        zIndex: 50,
        background: flash ? "var(--ink)" : "var(--bg)",
        color: flash ? "var(--bg)" : "var(--ink)",
        border: "1.5px solid var(--ink)",
        padding: "4px 10px",
        transition: "background 0.15s, color 0.15s",
      }}
      className="font-sans text-[13px] uppercase tracking-[2px]"
    >
      {flash ? "Copied!" : room.code}
    </button>
  );
}

function ConnectionErrorView() {
  const { connectionError } = useRoom();
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = params?.code;

  if (!connectionError) return null;

  let title = "";
  let message = "";
  let action: React.ReactNode = null;

  switch (connectionError) {
    case "GAME_IN_PROGRESS":
      title = "Game in progress";
      message =
        "This room is mid-game and couldn't take you in. Try again in a moment.";
      action = (
        <Link href="/">
          <Button variant="primary">Back to home</Button>
        </Link>
      );
      break;
    case "UNKNOWN_PLAYER":
      title = "Room unavailable";
      message = "This room is no longer available.";
      action = (
        <Link href="/">
          <Button variant="primary">Back to home</Button>
        </Link>
      );
      break;
    case "PROTOCOL_MISMATCH":
      title = "Update required";
      message = "Please refresh the page.";
      action = (
        <Button
          variant="primary"
          onClick={() => {
            if (typeof window !== "undefined") window.location.reload();
          }}
        >
          Refresh
        </Button>
      );
      break;
    case "CONNECT_TIMEOUT":
      title = "Connection timed out";
      message = "We couldn't reach the game server.";
      action = (
        <Button
          variant="primary"
          onClick={() => {
            if (typeof window !== "undefined") window.location.reload();
          }}
        >
          Retry
        </Button>
      );
      break;
    case "PLAYER_ALREADY_CONNECTED":
      title = "Already connected";
      message =
        "This player is already connected from another tab or device.";
      action = (
        <Link href="/">
          <Button variant="primary">Back to home</Button>
        </Link>
      );
      break;
    case "NAME_TAKEN":
      title = "Name taken";
      message =
        "Someone in this room already has that name. Try joining with a different one.";
      action = (
        <Link href="/join">
          <Button variant="primary">Try again</Button>
        </Link>
      );
      break;
  }

  return (
    <div className="screen text-center">
      <h1 className="font-serif font-bold text-[28px] text-ink mb-4">
        {title}
      </h1>
      <p className="font-body italic text-[16px] text-text-dim mb-8">
        {message}
      </p>
      {action}
    </div>
  );
}

function ConnectingView() {
  const [showTimeout, setShowTimeout] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShowTimeout(true), 10_000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="screen text-center">
      <p className="font-body italic text-[16px] text-text-dim">
        {showTimeout ? "Still connecting\u2026" : "Connecting\u2026"}
      </p>
    </div>
  );
}

// Ensures a WebSocket is always opened when the room page mounts.
// The /create and /join flows connect before navigating here, so
// isConnected() will be true and this is a no-op. On a fresh tab
// (e.g. reopening the URL after closing the browser), gameClient
// is a fresh singleton with no socket — we must initiate the
// connection ourselves. The server decides whether the id we send
// (sessionStorage → localStorage fallback inside connect()) is a
// reconnect, a new joiner, or should be rejected.
function AutoConnect() {
  const params = useParams<{ code: string }>();
  const code = params?.code;

  useEffect(() => {
    if (!code) return;
    if (gameClient.isConnected()) return;

    // If we navigated here from the EndScreen "Join Lobby" button, the
    // player's name was stashed in sessionStorage (keyed by new room
    // code). Use it so they join the brand-new room with the right name.
    // There is no stored playerId for a new room code yet.
    let playerName = "";
    let previousHostName = "";
    try {
      const nameKey = `plotline.nextJoin.${code}`;
      const hostKey = `plotline.prevHost.${code}`;
      playerName = sessionStorage.getItem(nameKey) ?? "";
      previousHostName = sessionStorage.getItem(hostKey) ?? "";
      if (playerName) sessionStorage.removeItem(nameKey);
      if (previousHostName) sessionStorage.removeItem(hostKey);
    } catch {}

    gameClient.connect(code, playerName, undefined, { previousHostName: previousHostName || undefined }).catch(() => {
      // Errors surface via onConnectionError → ConnectionErrorView
    });
  }, [code]);

  return null;
}

function BackButtonGuard() {
  const { room } = useRoom();
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  // Stores what to do when the player confirms they want to leave.
  // Defaults to navigating home; overridden when the logo is clicked.
  const onConfirmRef = useRef<(() => void) | null>(null);

  // Guard during lobby and active gameplay — not end screen
  const isActiveGame =
    room?.state === "LOBBY" ||
    room?.state === "CREATED" ||
    room?.state === "PLAYING" ||
    room?.state === "REVEAL";

  const showModal = (onConfirm?: () => void) => {
    onConfirmRef.current = onConfirm ?? (() => router.push("/"));
    setShowConfirm(true);
  };

  // Register with the module-level guard so PlaybillBanner can trigger it
  useEffect(() => {
    if (!isActiveGame) {
      clearLeaveGuard();
      return;
    }
    registerLeaveGuard((onConfirm) => showModal(onConfirm));
    return () => clearLeaveGuard();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActiveGame]);

  // Push a history guard entry and listen for popstate
  useEffect(() => {
    if (!isActiveGame) return;

    history.pushState({ backGuard: true }, "");

    const handlePopState = () => {
      history.pushState({ backGuard: true }, "");
      showModal();
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActiveGame]);

  // Warn on tab close / refresh during active gameplay
  useEffect(() => {
    if (!isActiveGame) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isActiveGame]);

  const handleLeave = () => {
    setShowConfirm(false);
    onConfirmRef.current?.();
    onConfirmRef.current = null;
  };

  if (!showConfirm) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-ink/60">
      <div className="bg-white border border-ink w-full max-w-sm p-6">
        <p className="font-serif font-bold text-[20px] text-ink mb-2">
          Leave the show?
        </p>
        <p className="font-body italic text-[15px] text-text-dim mb-6">
          {room?.state === "LOBBY" || room?.state === "CREATED"
            ? "You'll be removed from the lobby."
            : "You\u2019ll lose your place in the game."}
        </p>
        <div className="flex flex-col gap-4">
          <Button variant="primary" onClick={() => setShowConfirm(false)}>
            Stay in the Show
          </Button>
          <button
            onClick={handleLeave}
            className="font-sans text-[12px] uppercase tracking-[2px] text-text-dim hover:text-ink transition-colors"
          >
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}

// Holds the outgoing screen visible while it fades out, then swaps in the
// new screen (which carries its own anim-fade-in). screenKey must change
// whenever a meaningfully different screen should be shown.
function ScreenTransition({
  screenKey,
  children,
}: {
  screenKey: string;
  children: React.ReactNode;
}) {
  const [displayed, setDisplayed] = useState<React.ReactNode>(children);
  const [exiting, setExiting] = useState(false);
  const childrenRef = useRef(children);
  childrenRef.current = children;
  const prevKeyRef = useRef(screenKey);

  useEffect(() => {
    if (screenKey === prevKeyRef.current) return;
    prevKeyRef.current = screenKey;
    setExiting(true);
  }, [screenKey]);

  const handleAnimationEnd = (e: React.AnimationEvent<HTMLDivElement>) => {
    // Ignore animationend events that bubble up from children — only act on
    // the wrapper div's own fade-out animation finishing.
    if (e.target !== e.currentTarget) return;
    setDisplayed(childrenRef.current);
    setExiting(false);
  };

  return (
    <div
      className={exiting ? "screen-exit" : ""}
      onAnimationEnd={exiting ? handleAnimationEnd : undefined}
    >
      {displayed}
    </div>
  );
}

function InfoStrip({
  playerName,
  code,
  timerStartedAt,
  timerDurationMs,
}: {
  playerName: string | null;
  code: string;
  timerStartedAt?: number | null;
  timerDurationMs?: number;
}) {
  const [flash, setFlash] = useState(false);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  // Connection state
  const { playerStatuses, currentPlayer } = useRoom();
  const connectionState = gameClient.isConnected()
    ? currentPlayer && playerStatuses[currentPlayer.id] === "reconnecting"
      ? "reconnecting"
      : currentPlayer && playerStatuses[currentPlayer.id] === "disconnected"
      ? "disconnected"
      : "connected"
    : "disconnected";

  const dotColor =
    connectionState === "connected"
      ? "#1a1a1a"
      : connectionState === "reconnecting"
      ? "#b45309"
      : "#b91c1c";

  // Timer
  useEffect(() => {
    if (!timerStartedAt || !timerDurationMs) {
      setRemainingMs(null);
      return;
    }
    function tick() {
      const left = Math.max(0, timerStartedAt! + timerDurationMs! - Date.now());
      setRemainingMs(left);
    }
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [timerStartedAt, timerDurationMs]);

  const totalSeconds = remainingMs !== null ? Math.ceil(remainingMs / 1000) : null;
  const timerDisplay = totalSeconds !== null
    ? `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`
    : null;
  const timerColor = totalSeconds !== null && totalSeconds <= 10
    ? "#dc2626"
    : totalSeconds !== null && totalSeconds <= 30
    ? "#d97706"
    : "#ffffff";

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setFlash(true);
      setTimeout(() => setFlash(false), 1200);
    });
  };

  return (
    <div
      className="bg-ink py-[6px] px-4 flex items-center justify-between cursor-pointer"
      onClick={handleCopy}
    >
      <div className="flex items-center gap-2">
        <div
          className="w-[6px] h-[6px] rounded-full"
          style={{ backgroundColor: dotColor }}
        />
        {playerName && (
          <span className="font-sans text-[11px] uppercase tracking-[2px] font-semibold text-white">
            {playerName}
          </span>
        )}
      </div>

      {timerDisplay && (
        <span
          className="font-sans text-[13px] font-semibold tracking-[1px]"
          style={{ color: timerColor }}
        >
          {timerDisplay}
        </span>
      )}

      <span className={`font-sans text-[11px] font-semibold tracking-[2px] ${flash ? "text-white" : "text-white"}`}>
        {flash ? "Copied!" : code}
      </span>
    </div>
  );
}

function RoomContent() {
  const {
    room,
    currentPlayer,
    isPending,
    playerStatuses,
    connectionError,
    roomRedirect,
    roundStartedAt,
    roundDurationMs,
    votingOpen,
  } = useRoom();
  const router = useRouter();

  // Handle ROOM_REDIRECT — navigate to the new room
  useEffect(() => {
    if (roomRedirect) {
      try {
        gameClient.disconnect();
      } catch {
        // ignore
      }
      router.push(`/room/${roomRedirect}`);
    }
  }, [roomRedirect, router]);

  const hasSubmitted = !!(
    currentPlayer && playerStatuses[currentPlayer.id] === "submitted"
  );

  // Derive a stable key for the current screen so ScreenTransition knows
  // when to animate a crossfade.
  const screenKey = (() => {
    if (connectionError) return "error";
    if (!room) return "connecting";
    switch (room.state) {
      case "LOBBY":
      case "CREATED":
        return "lobby";
      case "PLAYING":
        return hasSubmitted ? "waiting" : `prompt-${room.currentRound}`;
      case "REVEAL":
        return room.votingState ? `voting-${room.votingState.storyIndex}` : "reveal";
      case "END":
      case "DESTROYED":
        return "end";
      default:
        return "unknown";
    }
  })();

  const screen = (() => {
    if (connectionError) return <ConnectionErrorView />;
    if (!room) return <ConnectingView />;

    // Spectators (pending/late-join players) get contextual views:
    // REVEAL → full non-reader RevealScreen (isReader fixed for null currentPlayer)
    // END    → full EndScreen with spectator queue controls
    // else   → SpectatorScreen (handles PLAYING + LOBBY/CREATED)
    if (isPending) {
      if (room.state === "REVEAL") return <RevealScreen />;
      if (room.state === "END" || room.state === "DESTROYED") return <EndScreen />;
      return <SpectatorScreen />;
    }

    switch (room.state) {
      case "LOBBY":
      case "CREATED":
        return <LobbyScreen />;

      case "PLAYING":
        return hasSubmitted ? <WaitingScreen /> : <PromptScreen />;

      case "REVEAL":
        return room.votingState ? <VotingScreen /> : <RevealScreen />;

      case "END":
      case "DESTROYED":
        return room.gameMode === "competitive" ? <CompetitiveEndScreen /> : <EndScreen />;

      default:
        return (
          <div className="screen text-center">
            <p className="font-body italic text-[16px] text-text-dim">
              Unknown state
            </p>
          </div>
        );
    }
  })();

  const playerName = currentPlayer?.name ?? null;
  const showStrip = room !== null && !connectionError;

  // Timer: show during PLAYING and voting
  const showTimer = room?.state === "PLAYING" || !!votingOpen;
  const timerStartedAt = votingOpen ? votingOpen.votingStartedAt : roundStartedAt;
  const timerDurationMs = votingOpen ? votingOpen.votingDurationMs : roundDurationMs;

  return (
    <>
      {showStrip && room?.code && (
        <InfoStrip
          playerName={playerName}
          code={room.code}
          timerStartedAt={showTimer ? timerStartedAt : null}
          timerDurationMs={showTimer ? timerDurationMs : undefined}
        />
      )}
      <ScreenTransition screenKey={screenKey}>{screen}</ScreenTransition>
    </>
  );
}

export default function RoomPage() {
  return (
    <ErrorBoundary>
      <RoomProvider>
        <AutoConnect />
        <BackButtonGuard />
        <RoomContent />
      </RoomProvider>
    </ErrorBoundary>
  );
}
