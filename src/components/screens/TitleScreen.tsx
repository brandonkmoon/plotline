"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/Button";
import { getCurrentRoomInfo } from "@/lib/multiplayer/gameClient";
import { setHelpScreen } from "@/lib/helpContext";

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
    setHelpScreen("title");
  }, []);

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
    <>
      {/* ── Hero: fills viewport below banner ── */}
      <div
        className="screen flex flex-col items-stretch"
        style={{ minHeight: "calc(100vh - 100px)", paddingBottom: 0 }}
      >
        {/* Top spacer — equal weight with bottom spacer to center the group */}
        <div className="flex-1" />

        {/* Centered button group */}
        <div>
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

          {/* Supporting text */}
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

        {/* Bottom spacer — equal weight with top spacer */}
        <div className="flex-1" />

        {/* Down arrow — pinned to bottom of viewport */}
        <div
          className="flex justify-center pb-6 transition-opacity duration-500"
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
      </div>

      {/* ── Below-fold marketing content ─────────────────────────── */}
      <div className="screen" style={{ paddingTop: 0 }}>

        {/* Scene example */}
        <p className="font-sans text-[10px] uppercase tracking-[3px] text-text-muted text-center mb-6">
          A scene from last night.
        </p>

        <div className="border-t border-b border-ink py-8 space-y-3">
          <p className="font-serif font-bold text-[22px] text-ink leading-tight mb-6 text-center">
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

        <p className="font-sans text-[12px] uppercase tracking-[2px] text-ink text-center my-8">
          Different writers. Zero coordination.
        </p>

        <hr className="rule" />

        {/* Occasions — left-aligned */}
        <p className="font-body text-[15px] text-ink leading-relaxed my-8">
          Works for game nights, dinner parties, bachelorette parties, team offsites,
          family reunions, improv groups, and theater classes. Also: situations you
          haven&rsquo;t thought of yet.
        </p>

        <hr className="rule" />

        {/* Competitive mode — left-aligned */}
        <div className="my-8 space-y-3">
          <p className="font-serif font-bold text-[20px] text-ink">Want a winner?</p>
          <p className="font-body text-[15px] text-ink leading-relaxed">
            Upgrade to Producer and unlock Competitive Mode &mdash; vote on the best lines,
            deploy your one standing ovation per game for something truly exceptional,
            and play a series with cumulative standings and a full awards
            ceremony.
          </p>
          <p className="font-body italic text-[15px] text-text-dim">
            Every great show needs a producer.
          </p>
        </div>

        <hr className="rule" />

        {/* Closing — centered vertically between rules */}
        <p className="font-serif font-bold text-[22px] text-ink text-center leading-snug my-12">
          Your group has a scene like this.<br />
          You just haven&rsquo;t written it yet.
        </p>

        {/* App Store badge */}
        <div className="flex justify-center my-8">
          <a
            href="https://apps.apple.com/app/id6763647982"
            target="_blank"
            rel="noopener noreferrer"
          >
            <img
              src="https://tools.applemediaservices.com/api/badges/download-on-the-app-store/black/en-us?size=250x83"
              alt="Download on the App Store"
              style={{ height: 44 }}
            />
          </a>
        </div>

        <hr className="rule" />

        {/* Footer — centered */}
        <p className="font-sans text-[11px] text-text-muted text-center tracking-[1px] my-8">
          <a href="/privacy.html" className="hover:text-ink transition-colors">Privacy</a>
          <span className="mx-2 opacity-40">|</span>
          Created by Brandon Moon
        </p>
      </div>
    </>

  );
}
