"use client";

import { useState, useEffect } from "react";

interface CountdownTimerProps {
  roundStartedAt: number | null | undefined;
  roundDurationMs?: number;
  roomState?: string;
}

const DEFAULT_ROUND_DURATION_MS = 90_000;

export default function CountdownTimer({
  roundStartedAt,
  roundDurationMs = DEFAULT_ROUND_DURATION_MS,
  roomState,
}: CountdownTimerProps) {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    // Guard: if roundStartedAt is missing, invalid, or not a finite number
    if (
      roundStartedAt == null ||
      !Number.isFinite(roundStartedAt) ||
      roundStartedAt <= 0
    ) {
      setRemainingMs(null);
      return;
    }

    if (
      !Number.isFinite(roundDurationMs) ||
      roundDurationMs <= 0
    ) {
      setRemainingMs(null);
      return;
    }

    function tick() {
      const left = Math.max(
        0,
        (roundStartedAt as number) + roundDurationMs - Date.now()
      );
      setRemainingMs(Number.isFinite(left) ? left : null);
    }

    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [roundStartedAt, roundDurationMs]);

  // Determine display:
  // - if we have a valid remainingMs, show M:SS
  // - if roundStartedAt is null and we are in PLAYING, show 0:00 (graceful)
  // - otherwise show --:--
  if (remainingMs === null) {
    if (roomState === "PLAYING") {
      return (
        <div className="font-serif text-[32px] text-text-muted">0:00</div>
      );
    }
    return (
      <div className="font-serif text-[32px] text-text-muted">--:--</div>
    );
  }

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const display = `${minutes}:${String(seconds).padStart(2, "0")}`;

  let colorClass = "text-text-dim";
  if (totalSeconds <= 10) {
    colorClass = "text-red-500 connection-pulse";
  } else if (totalSeconds <= 20) {
    colorClass = "gold-text";
  }

  return (
    <div className={`font-serif text-[32px] ${colorClass}`}>
      {display}
    </div>
  );
}
