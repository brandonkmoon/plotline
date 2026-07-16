"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { requestLeave } from "@/lib/client/leaveGuard";

// Persistent masthead shown at the top of every page. The yellow Playbill
// banner is part of the shared layout, not per-screen.
// Title is a pre-rendered PNG to avoid font-loading flash (FOUT).
export default function PlaybillBanner() {
  const router = useRouter();

  const handleLogoClick = (e: React.MouseEvent) => {
    e.preventDefault();
    requestLeave(() => router.push("/"));
  };

  return (
    <div className="banner">
      <Link href="/" onClick={handleLogoClick} aria-label="Go to home">
        {/* Deliberately a plain <img>, not next/image: the title must paint
            instantly with no optimization round-trip to avoid a title flash. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/plotline-title.png"
          alt="Plotline"
          className="banner-title-img"
          width={355}
          height={44}
          draggable={false}
        />
      </Link>
      <div className="banner-subtitle">The Collaborative Storytelling Game</div>
    </div>
  );
}
