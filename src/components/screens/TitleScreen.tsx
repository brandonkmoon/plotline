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

      {/* Down arrow — hints at scrollable content below */}
      <div
        className="flex justify-center mt-6 transition-opacity duration-500"
        style={{ opacity: ready ? 1 : 0, transitionDelay: ready ? "400ms" : "0ms" }}
      >
        <span
          className="text-text-muted animate-bounce"
          style={{ fontSize: 20, lineHeight: 1 }}
          aria-hidden="true"
        >
          &darr;
        </span>
      </div>

      {/* ── Below-fold marketing content ─────────────────────────── */}
      <div
        className="transition-opacity duration-700 mt-16"
        style={{ opacity: ready ? 1 : 0, transitionDelay: ready ? "600ms" : "0ms" }}
      >
        {/* Scene example */}
        <p className="font-sans text-[10px] uppercase tracking-[3px] text-text-muted text-center mb-6">
          A scene from last night.
        </p>

        <div className="border-t border-b border-ink py-8 space-y-3">
          <p className="font-serif font-bold text-[22px] text-ink leading-tight mb-6">
            &ldquo;Brenda and Gary at the Hospital&rdquo;
          </p>

          {[
            { line: "Brenda \u2014 a woman who irons her socks", by: "Rachel" },
            { line: "and Gary \u2014 a semi-professional kazoo player who is between gigs", by: "Tom" },
            { line: "are in a hospital waiting room that smells like a Subway restaurant,", by: "Brenda" },
            { line: "teaching a pigeon to sit.", by: "Gary" },
            { line: "Brenda says, \u201cI didn\u2019t come here to make friends, and yet.\u201d", by: "Nadia" },
            { line: "Gary says, \u201cThe thing about geese is you can\u2019t reason with them.\u201d", by: "Phil" },
            { line: "Then, the vending machine gave everyone their money back, which felt like a sign, but wasn\u2019t.", by: "Carmen" },
          ].map(({ line, by }) => (
            <div key={by}>
              <p className="font-body text-[16px] text-ink leading-[1.6]">{line}</p>
              <p className="font-sans text-[11px] text-text-muted tracking-[1px] mt-0.5">
                &mdash; written by {by}
              </p>
            </div>
          ))}
        </div>

        <p className="font-sans text-[12px] uppercase tracking-[2px] text-ink text-center mt-6 mb-12">
          Different writers. Zero coordination.
        </p>

        {/* Practical info */}
        <hr className="rule" />
        <p className="font-body italic text-[15px] text-text-dim text-center leading-relaxed my-6">
          4&ndash;12 players &middot; No app required &middot; Guests join from any browser
        </p>
        <p className="font-body text-[15px] text-ink text-center leading-relaxed mb-12">
          Works for game nights, dinner parties, bachelorette parties, team offsites,
          family reunions, improv groups, and theater classes. Also: situations you
          haven&rsquo;t thought of yet.
        </p>

        {/* Competitive mode */}
        <hr className="rule" />
        <div className="my-8 space-y-3">
          <p className="font-serif font-bold text-[20px] text-ink">Want a winner?</p>
          <p className="font-body text-[15px] text-ink leading-relaxed">
            Upgrade to Producer and unlock Competitive Mode &mdash; vote on the best lines,
            deploy your one standing ovation per game for something truly exceptional,
            and play a 3 or 5-game series with cumulative standings and a full awards
            ceremony.
          </p>
          <p className="font-body italic text-[15px] text-text-dim">
            Every great show needs a producer.
          </p>
        </div>

        {/* Closing */}
        <hr className="rule" />
        <p className="font-serif font-bold text-[22px] text-ink text-center leading-snug mt-8 mb-16">
          The stories are different every time.<br />
          Yours is next.
        </p>
      </div>

    </div>
  );
}
