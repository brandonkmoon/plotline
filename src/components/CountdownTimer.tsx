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
    if (
      roundStartedAt == null ||
      !Number.isFinite(roundStartedAt) ||
      roundStartedAt <= 0
    ) {
      setRemainingMs(null);
      return;
    }

    if (!Number.isFinite(roundDurationMs) || roundDurationMs <= 0) {
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

  const baseClass =
    "font-serif text-[28px] text-center tracking-[2px]";

  if (remainingMs === null) {
    if (roomState === "PLAYING") {
      return (
        <div className="text-center">
          <p className="font-sans text-[11px] uppercase tracking-[2px] text-text-muted mb-1">Time</p>
          <div className={`${baseClass} text-text-muted`}>0:00</div>
        </div>
      );
    }
    return (
      <div className="text-center">
        <p className="font-sans text-[11px] uppercase tracking-[2px] text-text-muted mb-1">Time</p>
        <div className={`${baseClass} text-text-muted`}>--:--</div>
      </div>
    );
  }

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const display = `${minutes}:${String(seconds).padStart(2, "0")}`;

  let colorClass = "text-ink";
  let animClass = "";
  if (totalSeconds <= 10) {
    colorClass = "text-red-600";
    animClass = "timer-pulse";
  } else if (totalSeconds <= 30) {
    colorClass = "text-amber-600";
  }

  return (
    <div className="text-center">
      <p className="font-sans text-[11px] uppercase tracking-[2px] text-text-muted mb-1">Time</p>
      <div className={`${baseClass} ${colorClass} ${animClass}`}>{display}</div>
    </div>
  );
}
