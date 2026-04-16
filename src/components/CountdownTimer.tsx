"use client";

import { useState, useEffect } from "react";

interface CountdownTimerProps {
  roundStartedAt: number | null;
  duration?: number;
}

export default function CountdownTimer({
  roundStartedAt,
  duration = 90,
}: CountdownTimerProps) {
  const [remaining, setRemaining] = useState(duration);

  useEffect(() => {
    if (roundStartedAt === null) {
      setRemaining(duration);
      return;
    }

    function tick() {
      const elapsed = Math.floor((Date.now() - roundStartedAt!) / 1000);
      const left = Math.max(0, duration - elapsed);
      setRemaining(left);
    }

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [roundStartedAt, duration]);

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
