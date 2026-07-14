"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { notFound } from "next/navigation";
import { GameClient } from "@/lib/multiplayer/gameClient";
import type { Room, AssembledStory } from "@/lib/game/types";
import type { PlayerStatus } from "@/lib/multiplayer/types";

interface LogEntry {
  direction: "in" | "out";
  data: string;
  timestamp: number;
}

export default function DebugPage() {
  // Debug console must never be reachable in production — it exposes raw
  // room state and lets anyone drive game actions.
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  const clientRef = useRef<GameClient | null>(null);
  const [roomCode, setRoomCode] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [statuses, setStatuses] = useState<Record<string, PlayerStatus>>({});
  const [stories, setStories] = useState<AssembledStory[]>([]);
  const [advanceCount, setAdvanceCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Submit prompt fields
  const [submitStoryIndex, setSubmitStoryIndex] = useState(0);
  const [submitPromptIndex, setSubmitPromptIndex] = useState(0);
  const [submitResponse, setSubmitResponse] = useState("");

  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  const cleanup = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.disconnect();
      clientRef.current = null;
    }
    setConnected(false);
    setPlayerId(null);
    setRoom(null);
    setStatuses({});
    setStories([]);
    setAdvanceCount(null);
  }, []);

  const connectToRoom = useCallback(
    async (code: string) => {
      cleanup();
      const client = new GameClient();
      clientRef.current = client;

      // Subscribe to events
      client.onStateUpdate((r) => {
        setRoom(r);
        setPlayerId(client.getPlayerId());
      });
      client.onPlayerStatusChanged((s) => setStatuses(s));
      client.onError((reason) => setError(reason));
      client.onAdvanceAvailable((count) => setAdvanceCount(count));
      client.onAssembledStories((s) => setStories(s));
      client.onMessageLog((entry) => {
        setLogs((prev) => [...prev.slice(-200), entry]);
      });

      try {
        const id = await client.connect(code, playerName);
        setPlayerId(id);
        setConnected(true);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Connection failed");
      }
    },
    [playerName, cleanup]
  );

  const handleCreateRoom = async () => {
    // Generate a random 4-char code
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 4; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    setRoomCode(code);
    await connectToRoom(code);
  };

  const handleJoinRoom = async () => {
    if (!roomCode.trim()) return;
    await connectToRoom(roomCode.trim().toUpperCase());
  };

  const isHost = room?.hostId === playerId;

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4 font-mono text-sm">
      <h1 className="text-xl font-bold mb-4">Plotline Debug Console</h1>

      {/* Connection Form */}
      {!connected && (
        <div className="border border-gray-600 p-4 mb-4 max-w-md">
          <h2 className="font-bold mb-2">Connect</h2>
          <div className="space-y-2">
            <div>
              <label className="block text-gray-400">Player Name</label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="bg-gray-800 border border-gray-600 px-2 py-1 w-full text-white"
                placeholder="Your name"
              />
            </div>
            <div>
              <label className="block text-gray-400">Room Code</label>
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                className="bg-gray-800 border border-gray-600 px-2 py-1 w-full text-white uppercase"
                placeholder="XXXX"
                maxLength={4}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCreateRoom}
                disabled={!playerName.trim()}
                className="bg-green-700 hover:bg-green-600 disabled:bg-gray-700 px-4 py-1"
              >
                Create Room
              </button>
              <button
                onClick={handleJoinRoom}
                disabled={!playerName.trim() || !roomCode.trim()}
                className="bg-blue-700 hover:bg-blue-600 disabled:bg-gray-700 px-4 py-1"
              >
                Join Room
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-900 border border-red-500 p-2 mb-4 max-w-2xl">
          ERROR: {error}
          <button onClick={() => setError(null)} className="ml-2 underline">
            dismiss
          </button>
        </div>
      )}

      {connected && room && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left Column: State + Actions */}
          <div className="space-y-4">
            {/* Connection Info */}
            <div className="border border-gray-600 p-3">
              <h2 className="font-bold mb-1">Connection</h2>
              <div>Room: {room.code}</div>
              <div>Player ID: {playerId}</div>
              <div>
                Is Host: {isHost ? "YES" : "no"}
              </div>
              <div>State: {room.state}</div>
              <div>Round: {room.currentRound}</div>
              <button
                onClick={cleanup}
                className="bg-red-700 hover:bg-red-600 px-3 py-1 mt-2"
              >
                Disconnect
              </button>
            </div>

            {/* Players */}
            <div className="border border-gray-600 p-3">
              <h2 className="font-bold mb-1">
                Players ({room.players.length})
              </h2>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-400">
                    <th className="text-left">Name</th>
                    <th className="text-left">ID (short)</th>
                    <th className="text-left">Host</th>
                    <th className="text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {room.players.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td>{p.id.slice(0, 8)}</td>
                      <td>{p.isHost ? "HOST" : ""}</td>
                      <td>{statuses[p.id] || "unknown"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Actions */}
            <div className="border border-gray-600 p-3">
              <h2 className="font-bold mb-2">Actions</h2>
              <div className="space-y-2">
                {isHost && room.state === "LOBBY" && (
                  <button
                    onClick={() => clientRef.current?.startGame()}
                    className="bg-green-700 hover:bg-green-600 px-3 py-1 block w-full text-left"
                  >
                    Start Game
                  </button>
                )}

                {room.state === "PLAYING" && (
                  <div className="border border-gray-500 p-2">
                    <h3 className="text-gray-400 mb-1">Submit Prompt</h3>
                    <div className="flex gap-1 mb-1">
                      <input
                        type="number"
                        value={submitStoryIndex}
                        onChange={(e) =>
                          setSubmitStoryIndex(Number(e.target.value))
                        }
                        className="bg-gray-800 border border-gray-600 px-1 w-16 text-white"
                        placeholder="story"
                      />
                      <input
                        type="number"
                        value={submitPromptIndex}
                        onChange={(e) =>
                          setSubmitPromptIndex(Number(e.target.value))
                        }
                        className="bg-gray-800 border border-gray-600 px-1 w-16 text-white"
                        placeholder="prompt"
                      />
                    </div>
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={submitResponse}
                        onChange={(e) => setSubmitResponse(e.target.value)}
                        className="bg-gray-800 border border-gray-600 px-1 flex-1 text-white"
                        placeholder="response text"
                      />
                      <button
                        onClick={() => {
                          clientRef.current?.submitPrompt(
                            submitStoryIndex,
                            submitPromptIndex,
                            submitResponse
                          );
                          setSubmitResponse("");
                        }}
                        className="bg-blue-700 hover:bg-blue-600 px-2"
                      >
                        Submit
                      </button>
                    </div>
                    <button
                      onClick={() =>
                        clientRef.current?.sendTypingStatus("writing")
                      }
                      className="bg-yellow-700 hover:bg-yellow-600 px-2 py-0.5 mt-1 mr-1 text-xs"
                    >
                      Set Writing
                    </button>
                    <button
                      onClick={() =>
                        clientRef.current?.sendTypingStatus("idle")
                      }
                      className="bg-gray-700 hover:bg-gray-600 px-2 py-0.5 mt-1 text-xs"
                    >
                      Set Idle
                    </button>
                  </div>
                )}

                {isHost && room.state === "PLAYING" && advanceCount !== null && (
                  <button
                    onClick={() => {
                      clientRef.current?.hostAdvance();
                      setAdvanceCount(null);
                    }}
                    className="bg-orange-700 hover:bg-orange-600 px-3 py-1 block w-full text-left"
                  >
                    Host Advance ({advanceCount} unsubmitted)
                  </button>
                )}

                {room.state === "REVEAL" && (
                  <button
                    onClick={() => clientRef.current?.advanceReveal()}
                    className="bg-purple-700 hover:bg-purple-600 px-3 py-1 block w-full text-left"
                  >
                    Reveal Next Story
                  </button>
                )}

                {(room.state === "REVEAL" || room.state === "END") && (
                  <>
                    <button
                      onClick={() => clientRef.current?.endGame()}
                      className="bg-red-700 hover:bg-red-600 px-3 py-1 block w-full text-left"
                    >
                      End Game
                    </button>
                    <button
                      onClick={() => clientRef.current?.playAgain()}
                      className="bg-green-700 hover:bg-green-600 px-3 py-1 block w-full text-left"
                    >
                      Play Again
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Assembled Stories */}
            {stories.length > 0 && (
              <div className="border border-gray-600 p-3">
                <h2 className="font-bold mb-1">Assembled Stories</h2>
                {stories.map((s) => (
                  <div key={s.storyIndex} className="mb-2 border-b border-gray-700 pb-2">
                    <div className="text-gray-400">Story {s.storyIndex}</div>
                    {s.prompts.map((prompt, i) => (
                      <div key={i} className="ml-2">
                        <span className="text-gray-500">{prompt}:</span>{" "}
                        <span className="text-yellow-300">{s.responses[i]}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Column: Raw State + Logs */}
          <div className="space-y-4">
            {/* Raw State */}
            <div className="border border-gray-600 p-3">
              <h2 className="font-bold mb-1">Raw Room State</h2>
              <pre className="text-xs overflow-auto max-h-96 bg-gray-950 p-2">
                {JSON.stringify(room, null, 2)}
              </pre>
            </div>

            {/* Message Log */}
            <div className="border border-gray-600 p-3">
              <h2 className="font-bold mb-1">
                Message Log ({logs.length})
                <button
                  onClick={() => setLogs([])}
                  className="ml-2 text-xs text-gray-400 underline"
                >
                  clear
                </button>
              </h2>
              <div
                ref={logRef}
                className="text-xs overflow-auto max-h-96 bg-gray-950 p-2 space-y-0.5"
              >
                {logs.map((log, i) => (
                  <div
                    key={i}
                    className={
                      log.direction === "out"
                        ? "text-green-400"
                        : "text-blue-400"
                    }
                  >
                    <span className="text-gray-500">
                      {new Date(log.timestamp).toLocaleTimeString()}{" "}
                    </span>
                    <span className="text-gray-400">
                      {log.direction === "out" ? ">>>" : "<<<"}{" "}
                    </span>
                    {log.data}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
