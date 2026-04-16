interface PlayerTagProps {
  name: string;
  isHost?: boolean;
  status?: "submitted" | "pending";
  isReconnecting?: boolean;
  isDisconnected?: boolean;
}

// A single-line player entry styled as a theater-program cast list row.
// Used inside a parent <ul> — provides its own left-side name + right-side
// host badge/status glyph.
export default function PlayerTag({
  name,
  isHost = false,
  status,
  isReconnecting = false,
  isDisconnected = false,
}: PlayerTagProps) {
  const dimClass = isReconnecting
    ? "opacity-50"
    : isDisconnected
    ? "opacity-30"
    : "";

  return (
    <li
      className={`font-body text-[18px] py-[10px] flex justify-between items-center border-b border-list-border last:border-b-0 ${dimClass}`}
    >
      <span className={isDisconnected ? "line-through" : ""}>
        {name}
        {isReconnecting && (
          <span className="ml-2 italic text-text-muted text-[13px]">
            (reconnecting)
          </span>
        )}
      </span>
      <span className="flex items-center gap-2">
        {status === "submitted" && (
          <span className="text-ink text-sm" aria-label="submitted">
            &#10003;
          </span>
        )}
        {status === "pending" && (
          <span className="text-text-muted text-sm" aria-label="pending">
            &#8943;
          </span>
        )}
        {isHost && (
          <span className="font-sans text-[11px] font-semibold uppercase tracking-[1px] bg-ink text-white px-2 py-[2px] rounded-[3px]">
            Host
          </span>
        )}
      </span>
    </li>
  );
}
