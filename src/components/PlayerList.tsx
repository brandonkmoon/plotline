// Unified player list used across all game screens.
// Renders name on the left, badges + status on the right.
// Pass showSubmissionStatus for prompt/waiting screens,
// readerId for the reveal screen.

interface Props {
  players: { id: string; name: string; isHost: boolean; isConnected: boolean }[];
  playerStatuses: Record<string, string>;
  showSubmissionStatus?: boolean;
  readerId?: string;
  animate?: boolean;
}

export default function PlayerList({
  players,
  playerStatuses,
  showSubmissionStatus = false,
  readerId,
  animate = false,
}: Props) {
  return (
    <ul className="w-full mt-6 list-none">
      {players.map((player, idx) => {
        const status = playerStatuses[player.id];
        const isDisconnected = status === "disconnected";
        const isReconnecting = status === "reconnecting";
        const isSubmitted = status === "submitted";
        const isReader = player.id === readerId;
        const dim = isDisconnected
          ? "opacity-30"
          : isReconnecting
          ? "opacity-50"
          : "";

        return (
          <li
            key={player.id}
            className={`font-body text-[15px] py-[10px] flex justify-between items-center border-b border-list-border last:border-b-0 ${dim} ${
              animate ? "player-enter" : ""
            }`}
            style={animate ? { animationDelay: `${idx * 80}ms`, opacity: 0 } : undefined}
          >
            {/* Left: name */}
            <span className={isDisconnected ? "line-through" : ""}>
              {player.name}
            </span>

            {/* Right: status + badges */}
            <span className="flex items-center gap-2">
              {isReconnecting && (
                <span className="font-sans italic text-[12px] text-text-muted">
                  reconnecting
                </span>
              )}
              {isDisconnected && (
                <span className="font-sans text-[12px] text-text-muted">
                  offline
                </span>
              )}

              {showSubmissionStatus && !isDisconnected && !isReconnecting && (
                <span
                  className={`font-sans text-[14px] inline-block ${
                    isSubmitted ? "text-ink check-pop" : "text-text-muted"
                  }`}
                >
                  {isSubmitted ? "\u2713" : "\u22EF"}
                </span>
              )}

              {isReader && (
                <span className="font-sans text-[10px] font-semibold uppercase tracking-[1px] bg-ink text-white px-2 py-[1px] rounded-none">
                  Reading
                </span>
              )}
              {player.isHost && !isReader && (
                <span className="font-sans text-[10px] font-semibold uppercase tracking-[1px] bg-ink text-white px-2 py-[1px] rounded-none">
                  Host
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
