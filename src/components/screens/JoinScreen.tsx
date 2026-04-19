"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { gameClient } from "@/lib/multiplayer/gameClient";
import { trackEvent } from "@/lib/analytics";
import Button from "@/components/Button";

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
      await gameClient.connect(code, name, undefined, { forceNewPlayer: true });
      trackEvent("room_joined");
      router.push(`/room/${code}`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Failed to join room";
      if (reason === "NAME_TAKEN") {
        setError("That name is already taken. Try a different one.");
      } else {
        setError(reason);
      }
      setLoading(false);
    }
  }, [code, name, router]);

  return (
    <div className="screen anim-fade-in">
      <h1 className="font-serif font-bold text-[28px] text-ink text-center mb-2">
        Join a Show
      </h1>
      <p className="font-body italic text-[15px] text-text-dim text-center mb-4">
        Enter a room code to join your group.
      </p>

      <hr className="rule" />

      <label className="block font-serif text-[13px] uppercase tracking-[2px] text-text-dim mb-2">
        Room Code
      </label>
      <input
        type="text"
        value={code}
        onChange={handleCodeChange}
        onKeyDown={(e) => e.key === "Enter" && name.length >= 2 && handleJoin()}
        placeholder="XXXX"
        className="w-full font-serif font-bold text-[32px] text-ink text-center py-[14px] px-4 border-2 border-input-border focus:border-ink focus:outline-none transition-colors"
        style={{ borderRadius: 0, letterSpacing: "clamp(4px, 3vw, 10px)" }}
        maxLength={4}
        autoComplete="off"
        autoCapitalize="characters"
      />

      <label className="block font-serif text-[13px] uppercase tracking-[2px] text-text-dim mb-2 mt-6">
        Your Name
      </label>
      <input
        type="text"
        value={name}
        onChange={handleNameChange}
        onKeyDown={(e) => e.key === "Enter" && handleJoin()}
        placeholder="Enter your name"
        className="w-full font-body text-[18px] text-ink py-[14px] px-4 border-2 border-input-border focus:border-ink focus:outline-none transition-colors"
        style={{ borderRadius: 0 }}
        maxLength={20}
        autoComplete="off"
      />

      {error && (
        <p className="mt-3 font-sans text-[13px] text-red-600">{error}</p>
      )}

      <div className="mt-6">
        <Button
          variant="primary"
          onClick={handleJoin}
          disabled={loading || code.length !== 4 || name.length < 2}
        >
          {loading ? "Joining\u2026" : "Join"}
        </Button>
      </div>

      <div className="text-center mt-6">
        <button
          onClick={() => router.push("/")}
          className="font-body italic text-[15px] text-text-muted hover:text-ink transition-colors"
        >
          &larr; Back
        </button>
      </div>
    </div>
  );
}
