"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { gameClient } from "@/lib/multiplayer/gameClient";
import { trackEvent } from "@/lib/analytics";
import Button from "@/components/Button";
import BlackletterHeading from "@/components/BlackletterHeading";
import GoldBar from "@/components/GoldBar";

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export default function CreateScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      if (val.length <= 20) {
        setName(val);
        setError("");
      }
    },
    []
  );

  const handleCreate = useCallback(async () => {
    if (name.length < 2) {
      setError("Name must be at least 2 characters");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const code = generateCode();
      await gameClient.connect(code, name);
      trackEvent("room_created");
      router.push(`/room/${code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create room");
      setLoading(false);
    }
  }, [name, router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6">
      <div
        className="flex flex-col items-center w-full"
        style={{ maxWidth: 420 }}
      >
        <BlackletterHeading size="48px" className="anim-title-in">
          <span className="gold-text">Create Game</span>
        </BlackletterHeading>

        <div className="mt-6 anim-fade-in" style={{ opacity: 0, animationDelay: "0.2s", animationFillMode: "forwards" }}>
          <GoldBar />
        </div>

        {/* Name input */}
        <div className="w-full mt-10 anim-fade-in" style={{ opacity: 0, animationDelay: "0.3s", animationFillMode: "forwards" }}>
          <label className="block font-sans text-[12px] uppercase tracking-[4px] text-text-muted mb-2">
            Your Name
          </label>
          <input
            type="text"
            value={name}
            onChange={handleNameChange}
            placeholder="Enter your name"
            className="w-full bg-surface border-2 border-border text-text font-serif text-[22px] py-3 px-4 focus:border-gold-dark focus:outline-none transition-colors"
            style={{ borderRadius: 0 }}
            maxLength={20}
            autoComplete="off"
          />
        </div>

        {/* Error */}
        {error && (
          <p className="mt-4 font-sans text-sm text-red-400">{error}</p>
        )}

        {/* Create button */}
        <div className="w-full mt-8 anim-fade-in" style={{ opacity: 0, animationDelay: "0.4s", animationFillMode: "forwards" }}>
          <Button
            variant="primary"
            onClick={handleCreate}
            disabled={loading || name.length < 2}
            className="w-full"
          >
            {loading ? "Creating..." : "Create"}
          </Button>
        </div>

        {/* Back link */}
        <button
          onClick={() => router.push("/")}
          className="mt-6 font-serif italic text-[16px] text-text-muted hover:text-text-dim transition-colors"
        >
          Back to title
        </button>
      </div>
    </div>
  );
}
