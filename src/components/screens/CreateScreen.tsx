"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { gameClient } from "@/lib/multiplayer/gameClient";
import { setHelpScreen } from "@/lib/helpContext";
import { generateRoomCode } from "@/lib/game";
import { trackEvent } from "@/lib/analytics";
import Button from "@/components/Button";

export default function CreateScreen() {
  const router = useRouter();
  useEffect(() => {
    setHelpScreen("title");
  }, []);

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
      const code = generateRoomCode();
      await gameClient.connect(code, name, undefined, { forceNewPlayer: true });
      trackEvent("room_created");
      router.push(`/room/${code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create room");
      setLoading(false);
    }
  }, [name, router]);

  return (
    <div className="screen anim-fade-in">
      <h1 className="font-serif font-bold text-[28px] text-ink text-center mb-2">
        Create a Show
      </h1>
      <p className="font-body italic text-[15px] text-text-dim text-center mb-4">
        Start a new room and invite your players.
      </p>

      <hr className="rule" />

      <label
        htmlFor="create-name"
        className="block font-serif text-[13px] uppercase tracking-[2px] text-text-dim mb-2"
      >
        Your Name
      </label>
      <input
        id="create-name"
        type="text"
        value={name}
        onChange={handleNameChange}
        onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        placeholder="Enter your name"
        className="w-full font-body text-[18px] text-ink py-[14px] px-4 border-2 border-input-border focus:border-ink focus:outline-none transition-colors"
        style={{ borderRadius: 0 }}
        maxLength={20}
        autoComplete="off"
        autoFocus
      />

      {error && (
        <p className="mt-3 font-sans text-[13px] text-red-600">{error}</p>
      )}

      <div className="mt-6">
        <Button
          variant="primary"
          onClick={handleCreate}
          disabled={loading || name.length < 2}
        >
          {loading ? "Creating\u2026" : "Create"}
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
