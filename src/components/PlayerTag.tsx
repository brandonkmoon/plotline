interface PlayerTagProps {
  name: string;
  isHost?: boolean;
  status?: "submitted" | "pending";
  isReconnecting?: boolean;
  isDisconnected?: boolean;
}

export default function PlayerTag({
  name,
  isHost = false,
  status,
  isReconnecting = false,
  isDisconnected = false,
}: PlayerTagProps) {
  return (
    <div
      className={`
        inline-flex items-center gap-2
        px-4 py-2 border-2 font-sans text-sm font-medium
        ${
          isHost
            ? "border-gold-dark text-gold-light"
            : "border-border text-text-dim"
        }
        ${isReconnecting ? "opacity-50" : ""}
        ${isDisconnected ? "opacity-30" : ""}
      `}
      style={{
        borderRadius: 0,
        boxShadow: isHost
          ? "0 0 12px rgba(212, 168, 67, 0.15)"
          : "none",
      }}
    >
      <span className={isDisconnected ? "line-through" : ""}>{name}</span>
      {isReconnecting && (
        <span className="italic text-text-muted text-[11px]">(reconnecting)</span>
      )}
      {status === "submitted" && (
        <span className="text-gold text-xs">&#10003;</span>
      )}
      {status === "pending" && (
        <span className="text-text-muted text-xs">&#8943;</span>
      )}
    </div>
  );
}
