// Unified player list used across all game screens.
// Renders name on the left, badges + status on the right.
// Pass showSubmissionStatus for prompt/waiting screens,
// readerId for the reveal screen.

interface Props {
  players: { id: string; name: string; isHost: boolean; isConnected: boolean }[];
  playerStatuses: Record<string, string>;
  showSubmissionStatus?: boolean;
  readerId?: string;
}

export default function PlayerList({
  players,
  playerStatuses,
  showSubmissionStatus = false,
  readerId,
}: Props) {
  return (
    <ul className="w-full mt-6 list-none">
      {players.map((player) => {
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
            className={`font-body text-[15px] py-[10px] flex justify-between items-center border-b border-list-border last:border-b-0 ${dim}`}
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
                <span className={`font-sans text-[14px] ${isSubmitted ? "text-ink" : "text-text-muted"}`}>
                  {isSubmitted ? "\u2713" : "\u22EF"}
                </span>
              )}

              {isReader && (
                <span className="font-sans text-[10px] font-semibold uppercase tracking-[1px] bg-ink text-white px-2 py-[1px] rounded-[3px]">
                  Reading
                </span>
              )}
              {player.isHost && !isReader && (
                <span className="font-sans text-[10px] font-semibold uppercase tracking-[1px] bg-ink text-white px-2 py-[1px] rounded-[3px]">
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
