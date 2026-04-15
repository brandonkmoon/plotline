"use client";

import { useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { gameClient } from "@/lib/multiplayer/gameClient";
import { trackEvent } from "@/lib/analytics";
import Button from "@/components/Button";
import GoldBar from "@/components/GoldBar";
import MorphVideo from "@/components/MorphVideo";

export default function TitleScreen() {
  const router = useRouter();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const rafRef = useRef<number>(0);

  // Glow pulse animation on the title via requestAnimationFrame sine wave
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    let start: number | null = null;

    function animate(ts: number) {
      if (!start) start = ts;
      const elapsed = (ts - start) / 1000;
      const glowIntensity = 0.2 + 0.1 * Math.sin(elapsed * 1.5);
      if (el) {
        el.style.textShadow = `
          2px 2px 0 rgba(0,0,0,.85),
          0 0 30px rgba(212,168,67,${glowIntensity}),
          0 0 60px rgba(212,168,67,${glowIntensity * 0.5})
        `;
      }
      rafRef.current = requestAnimationFrame(animate);
    }

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const handleCreate = useCallback(async () => {
    try {
      // Connect to a new room — the server creates the room on first join
      // We generate a random code and connect; the server will create it
      const code = generateCode();
      await gameClient.connect(code, "Host");
      trackEvent("room_created");
      router.push(`/room/${code}`);
    } catch {
      // If connection fails, still navigate so user can see error state
    }
  }, [router]);

  const handleJoin = useCallback(() => {
    router.push("/join");
  }, [router]);

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen px-6">
      {/* Background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 50% 40%, rgba(212,168,67,.08) 0%, transparent 70%)",
        }}
      />

      <div
        className="relative flex flex-col items-center w-full"
        style={{ maxWidth: 420 }}
      >
        {/* Video */}
        <div
          className="anim-fade-in"
          style={{ opacity: 0, animationDelay: "0s", animationFillMode: "forwards" }}
        >
          <MorphVideo size="large" />
        </div>

        {/* Title */}
        <h1
          ref={titleRef}
          className="font-display gold-text mt-8 anim-title-in"
          style={{
            fontSize: 88,
            lineHeight: 1,
            opacity: 0,
            animationDelay: "0.2s",
            animationFillMode: "forwards",
          }}
        >
          Plotline
        </h1>

        {/* Gold bar */}
        <div
          className="mt-6 anim-fade-in"
          style={{ opacity: 0, animationDelay: "0.4s", animationFillMode: "forwards" }}
        >
          <GoldBar />
        </div>

        {/* Tagline */}
        <p
          className="font-serif italic text-[20px] text-text-dim mt-4 anim-fade-in"
          style={{ opacity: 0, animationDelay: "0.6s", animationFillMode: "forwards" }}
        >
          You can&apos;t make this up. Oh wait.
        </p>

        {/* Buttons */}
        <div
          className="flex flex-col gap-4 w-full mt-10 anim-fade-in"
          style={{ opacity: 0, animationDelay: "0.8s", animationFillMode: "forwards" }}
        >
          <Button variant="primary" onClick={handleCreate} className="w-full">
            Create Game
          </Button>
          <Button variant="secondary" onClick={handleJoin} className="w-full">
            Join Game
          </Button>
        </div>

        {/* Footer */}
        <p
          className="mt-10 font-sans text-[12px] uppercase text-text-muted anim-fade-in"
          style={{
            letterSpacing: "4px",
            opacity: 0,
            animationDelay: "1s",
            animationFillMode: "forwards",
          }}
        >
          4 &ndash; 12 Players
        </p>

        <Link
          href="/privacy"
          className="mt-4 font-sans text-[11px] text-text-muted hover:text-text-dim transition-colors anim-fade-in"
          style={{
            letterSpacing: "2px",
            opacity: 0,
            animationDelay: "1.1s",
            animationFillMode: "forwards",
          }}
        >
          Privacy-respecting analytics &middot; No cookies
        </Link>
      </div>
    </div>
  );
}

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
