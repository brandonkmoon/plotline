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
      roundStartedAt <= 0 ||
      !Number.isFinite(roundDurationMs) ||
      roundDurationMs <= 0
    ) {
      setRemainingMs(null);
      return;
    }

    function tick() {
      const left = Math.max(0, (roundStartedAt as number) + roundDurationMs - Date.now());
      setRemainingMs(Number.isFinite(left) ? left : null);
    }

    tick();
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [roundStartedAt, roundDurationMs]);

  const fraction = remainingMs !== null && roundDurationMs > 0
    ? remainingMs / roundDurationMs
    : roomState === "PLAYING" ? 0 : 1;

  const totalSeconds = remainingMs !== null ? Math.ceil(remainingMs / 1000) : 0;

  const barColor = totalSeconds <= 5
    ? "#dc2626"
    : totalSeconds <= 15
    ? "#d97706"
    : "#1a1a1a";

  return (
    <div className="w-full">
      <div className="w-full h-[3px] bg-list-border overflow-hidden">
        <div
          className="h-full transition-all duration-100 ease-linear"
          style={{
            width: `${fraction * 100}%`,
            backgroundColor: barColor,
          }}
        />
      </div>
    </div>
  );
}
