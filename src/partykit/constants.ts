// ── Shared constants & utilities for the PartyKit room server ──

export const ROUND_TIMER_FIRST_GAME_MS = 90_000;
export const ROUND_TIMER_SUBSEQUENT_MS = 60_000;
export const RECONNECT_TIMEOUT_MS = 120_000; // 2 minutes
export const HOST_TRANSFER_TIMEOUT_MS = 30_000; // 30 seconds
export const ROOM_DESTROY_TIMEOUT_MS = 600_000; // 10 minutes
export const MAX_PLAYERS = 10;
export const MAX_NAME_LENGTH = 20;
export const MAX_RESPONSE_LENGTH = 500;
export const VOTING_DURATION_MS = 30_000;

/** Strip HTML tags and trim whitespace from user input. */
export function sanitize(input: string, maxLength: number): string {
  return input
    .replace(/<[^>]*>/g, "")  // strip HTML tags
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .trim()
    .slice(0, maxLength);
}
