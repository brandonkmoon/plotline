interface PlayerTagProps {
  name: string;
  isHost?: boolean;
  status?: "submitted" | "pending";
}

export default function PlayerTag({
  name,
  isHost = false,
  status,
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
      `}
      style={{
        borderRadius: 0,
        boxShadow: isHost
          ? "0 0 12px rgba(212, 168, 67, 0.15)"
          : "none",
      }}
    >
      <span>{name}</span>
      {status === "submitted" && (
        <span className="text-gold text-xs">&#10003;</span>
      )}
      {status === "pending" && (
        <span className="text-text-muted text-xs">&#8943;</span>
      )}
    </div>
  );
}
