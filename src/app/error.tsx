"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error boundary caught:", error);
  }, [error]);

  return (
    <div className="screen text-center">
      <hr className="rule" />
      <p className="font-serif font-medium text-[13px] uppercase tracking-[3px] text-text-muted mb-2">
        Technical Difficulties
      </p>
      <h1 className="font-serif font-bold text-[28px] text-ink mb-1">
        Something went wrong
      </h1>
      <p className="font-body italic text-[16px] text-text-dim mb-8">
        The show hit an unexpected snag. Try again, or head back home.
      </p>
      <div className="flex flex-col items-center gap-4">
        <button
          onClick={() => reset()}
          className="inline-block font-serif font-medium text-[16px] uppercase bg-ink text-white py-4 px-6 hover:bg-[#333] transition-colors"
          style={{ letterSpacing: "3px", borderRadius: 0 }}
        >
          Try Again
        </button>
        {/* Full reload (not next/link) is intentional here: it guarantees a
            clean slate out of the errored state. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/"
          className="font-sans text-[12px] uppercase tracking-[2px] text-text-dim hover:text-ink transition-colors"
        >
          Back to Home
        </a>
      </div>
    </div>
  );
}
