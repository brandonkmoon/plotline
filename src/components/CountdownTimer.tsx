"use client";

import { useState, useEffect } from "react";

interface CountdownTimerProps {
  roundStartedAt: number | null | undefined;
  duration?: number;
}

export default function CountdownTimer({
  roundStartedAt,
  duration = 90,
}: CountdownTimerProps) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    // Guard: if roundStartedAt is missing, invalid, or not a finite number
    if (
      roundStartedAt == null ||
      !Number.isFinite(roundStartedAt) ||
      roundStartedAt <= 0
    ) {
      setRemaining(null);
      return;
    }

    function tick() {
      const elapsed = Math.floor((Date.now() - roundStartedAt!) / 1000);
      const left = Math.max(0, duration - elapsed);
      // Final safety: if the math somehow produces NaN, treat as null
      setRemaining(Number.isFinite(left) ? left : null);
    }

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [roundStartedAt, duration]);

  // Don't render anything if we can't compute a valid time
  if (remaining === null) {
    return (
      <div className="font-serif text-[32px] text-text-muted">--:--</div>
    );
  }

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const display = `${minutes}:${String(seconds).padStart(2, "0")}`;

  let colorClass = "text-text-dim";
  if (remaining <= 10) {
    colorClass = "text-red-500 connection-pulse";
  } else if (remaining <= 20) {
    colorClass = "gold-text";
  }

  return (
    <div className={`font-serif text-[32px] ${colorClass}`}>
      {display}
    </div>
  );
}
