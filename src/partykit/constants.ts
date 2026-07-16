// ── Shared constants & utilities for the PartyKit room server ──

export const ROUND_TIMER_FIRST_GAME_MS = 90_000;
export const ROUND_TIMER_SUBSEQUENT_MS = 60_000;
export const RECONNECT_TIMEOUT_MS = 120_000; // 2 minutes
export const HOST_TRANSFER_TIMEOUT_MS = 30_000; // 30 seconds
export const ROOM_DESTROY_TIMEOUT_MS = 600_000; // 10 minutes
export const MAX_PLAYERS = 10;
export const MAX_NAME_LENGTH = 20;
export const MAX_RESPONSE_LENGTH = 500;
export const VOTING_DURATION_MS = 15_000;

/** Strip HTML tags and trim whitespace from user input. */
// Bidi override/isolate controls reorder text and garble the shared screen;
// long runs of combining marks (zalgo) do the same. Both also let two visually
// distinct names collide (or evade) the uniqueness check.
const BIDI_CONTROLS = /[\u202A-\u202E\u2066-\u2069\u200E\u200F\u061C]/g;
const COMBINING_RUN = /\p{M}{3,}/gu; // 3+ stacked marks → keep the first two

export function sanitize(input: string, maxLength: number): string {
  return input
    .normalize("NFKC") // fold compatibility/homoglyph forms; compose diacritics
    .replace(/<[^>]*>/g, "") // strip HTML tags
    .replace(BIDI_CONTROLS, "") // strip bidi override/isolate controls
    .replace(COMBINING_RUN, (m) => m.slice(0, 2)) // cap zalgo stacks
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .trim()
    .slice(0, maxLength);
}
