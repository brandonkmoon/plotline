"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Button from "@/components/Button";

export default function TitleScreen() {
  const router = useRouter();

  const handleCreate = useCallback(() => {
    router.push("/create");
  }, [router]);

  const handleJoin = useCallback(() => {
    router.push("/join");
  }, [router]);

  return (
    <div className="screen anim-fade-in">
      <p className="font-body text-center text-[16px] text-text-dim italic mb-6">
        A blind collaborative storytelling game for 4&ndash;12 players.
      </p>

      <hr className="rule" />

      <div className="flex flex-col gap-3 mt-8">
        <Button variant="primary" onClick={handleCreate}>
          Create Game
        </Button>
        <Button variant="secondary" onClick={handleJoin}>
          Join Game
        </Button>
      </div>

      <p className="mt-10 font-sans text-[11px] uppercase text-text-muted text-center tracking-[3px]">
        4 &ndash; 12 Players
      </p>

      <div className="text-center mt-6">
        <Link
          href="/privacy"
          className="font-sans text-[11px] uppercase tracking-[2px] text-text-muted hover:text-ink transition-colors"
        >
          Privacy-respecting analytics &middot; No cookies
        </Link>
      </div>
    </div>
  );
}
