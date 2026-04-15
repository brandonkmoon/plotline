"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { gameClient } from "@/lib/multiplayer/gameClient";
import { trackEvent } from "@/lib/analytics";
import Button from "@/components/Button";
import BlackletterHeading from "@/components/BlackletterHeading";
import GoldBar from "@/components/GoldBar";

export default function JoinScreen() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCodeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (val.length <= 4) {
        setCode(val);
        setError("");
      }
    },
    []
  );

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

  const handleJoin = useCallback(async () => {
    if (code.length !== 4) {
      setError("Room code must be 4 characters");
      return;
    }
    if (name.length < 2) {
      setError("Name must be at least 2 characters");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await gameClient.connect(code, name);
      trackEvent("room_joined");
      router.push(`/room/${code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join room");
      setLoading(false);
    }
  }, [code, name, router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6">
      <div
        className="flex flex-col items-center w-full"
        style={{ maxWidth: 420 }}
      >
        <BlackletterHeading size="48px" className="anim-title-in">
          <span className="gold-text">Join Game</span>
        </BlackletterHeading>

        <div className="mt-6 anim-fade-in" style={{ opacity: 0, animationDelay: "0.2s", animationFillMode: "forwards" }}>
          <GoldBar />
        </div>

        {/* Room code input */}
        <div className="w-full mt-10 anim-fade-in" style={{ opacity: 0, animationDelay: "0.3s", animationFillMode: "forwards" }}>
          <label className="block font-sans text-[12px] uppercase tracking-[4px] text-text-muted mb-2">
            Room Code
          </label>
          <input
            type="text"
            value={code}
            onChange={handleCodeChange}
            placeholder="XXXX"
            className="w-full bg-surface border-2 border-border text-text text-center font-mono text-[36px] py-4 px-4 focus:border-gold-dark focus:outline-none transition-colors"
            style={{
              borderRadius: 0,
              letterSpacing: "8px",
            }}
            maxLength={4}
            autoComplete="off"
            autoCapitalize="characters"
          />
        </div>

        {/* Name input */}
        <div className="w-full mt-6 anim-fade-in" style={{ opacity: 0, animationDelay: "0.4s", animationFillMode: "forwards" }}>
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

        {/* Join button */}
        <div className="w-full mt-8 anim-fade-in" style={{ opacity: 0, animationDelay: "0.5s", animationFillMode: "forwards" }}>
          <Button
            variant="primary"
            onClick={handleJoin}
            disabled={loading || code.length !== 4 || name.length < 2}
            className="w-full"
          >
            {loading ? "Joining..." : "Join"}
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
