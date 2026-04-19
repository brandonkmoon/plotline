"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/Button";
import { getCurrentRoomInfo } from "@/lib/multiplayer/gameClient";

// Module-level flag so the entrance animation plays once per browser
// session. Stays true across remounts (e.g. navigating to /create or
// /join and coming back). Resets only on a full page reload.
let hasAnimated = false;

type Phase = "pause" | "sliding" | "done";

export default function TitleScreen() {
  const router = useRouter();
  // If we've already animated once this session, jump straight to "done".
  const [phase, setPhase] = useState<Phase>(hasAnimated ? "done" : "pause");
  const [rejoinInfo, setRejoinInfo] = useState<{ code: string; name: string } | null>(null);

  useEffect(() => {
    setRejoinInfo(getCurrentRoomInfo());
  }, []);

  useEffect(() => {
    if (hasAnimated) return;

    // 0–600ms: bare banner, content invisible
    // 600–1800ms: buttons slide in (900ms animation + 150ms stagger)
    // 1800ms onward: text fades in, buttons become clickable
    const t1 = setTimeout(() => setPhase("sliding"), 600);
    const t2 = setTimeout(() => {
      setPhase("done");
      hasAnimated = true;
    }, 1800);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const handleCreate = useCallback(() => {
    router.push("/create");
  }, [router]);

  const handleJoin = useCallback(() => {
    router.push("/join");
  }, [router]);

  const showButtons = phase !== "pause";
  const ready = phase === "done";

  return (
    <div className="screen">
      {/* Generous whitespace — pushes buttons down the page.
          clamp() keeps it reasonable on small screens. */}
      <div style={{ height: "clamp(80px, 20vh, 200px)" }} />

      {/* Tagline — fades in with the rest of the content */}
      <p
        className="font-body italic text-[16px] text-text-dim text-center mb-8 transition-opacity duration-500"
        style={{
          opacity: ready ? 1 : 0,
          transitionDelay: ready ? "100ms" : "0ms",
        }}
      >
        Everyone writes. Nobody looks. Then the stories come to life.
      </p>

      {/* Create — primary */}
      <div
        className={`title-btn-wrapper ${
          showButtons ? "title-btn-animate" : ""
        }`}
      >
        <div style={{ pointerEvents: ready ? "auto" : "none" }}>
          <Button variant="primary" onClick={handleCreate}>
            <span className={`title-btn-text ${ready ? "visible" : ""}`}>
              Create a Show
            </span>
          </Button>
        </div>
      </div>

      {/* Join — secondary, staggered 150ms */}
      <div
        className={`title-btn-wrapper mt-3 ${
          showButtons ? "title-btn-animate title-btn-delay" : ""
        }`}
      >
        <div style={{ pointerEvents: ready ? "auto" : "none" }}>
          <Button variant="secondary" onClick={handleJoin}>
            <span className={`title-btn-text ${ready ? "visible" : ""}`}>
              Join a Show
            </span>
          </Button>
        </div>
      </div>

      {/* Rejoin prompt — shown when a game is in progress */}
      {rejoinInfo && (
        <div
          className={`title-btn-wrapper mt-3 ${
            showButtons ? "title-btn-animate title-btn-delay" : ""
          }`}
          style={{ transitionDelay: showButtons ? "300ms" : "0ms" }}
        >
          <div style={{ pointerEvents: ready ? "auto" : "none" }}>
            <button
              onClick={() => router.push(`/room/${rejoinInfo.code}`)}
              className="w-full border border-ink px-6 py-3 font-sans text-[13px] uppercase tracking-[2px] text-text-dim hover:text-ink hover:bg-ink/5 transition-colors"
            >
              <span className={`title-btn-text ${ready ? "visible" : ""}`}>
                Rejoin{" "}
                {rejoinInfo.name ? `as ${rejoinInfo.name} · ` : ""}
                {rejoinInfo.code}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Supporting text — opacity-only fade, staggered after buttons settle */}
      <p
        className="mt-10 font-sans text-[11px] uppercase text-text-muted text-center tracking-[3px] transition-opacity duration-500"
        style={{
          opacity: ready ? 1 : 0,
          transitionDelay: ready ? "200ms" : "0ms",
        }}
      >
        4 &ndash; 12 Players
      </p>

    </div>
  );
}
