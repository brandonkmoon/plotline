// Lightweight global store for the current help tip.
// Game screens call setHelpScreen() to update the context-sensitive tip.
// HelpOverlay reads it to show the right one-liner.

export type HelpScreen =
  | "title"
  | "lobby"
  | "prompt-name"
  | "prompt-text"
  | "waiting"
  | "reveal"
  | "voting"
  | "end"
  | "competitive-end"
  | "spectator"
  | null;

let currentScreen: HelpScreen = null;
const listeners = new Set<() => void>();

export function setHelpScreen(screen: HelpScreen) {
  currentScreen = screen;
  listeners.forEach((fn) => fn());
}

export function getHelpScreen(): HelpScreen {
  return currentScreen;
}

export function onHelpScreenChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const HELP_TIPS: Record<string, string> = {
  "title": "Create a room and share the code. 4\u201312 players, no app required.",
  "lobby": "Share the room code. The host starts the game when 4+ players have joined.",
  "prompt-name": "Tap someone\u2019s name, then write a short character description for them.",
  "prompt-text": "Write your answer in present tense. Keep it short \u2014 one line is perfect.",
  "waiting": "You\u2019re locked in. Waiting for everyone else to finish.",
  "reveal": "The reader reads the scene aloud. Lines appear one at a time.",
  "voting": "Tap a line to vote (1 pt). Long-press for a standing ovation (3 pts to author, 2 to you). One per game.",
  "end": "Share or save your scenes. Tap Play Again to start a new lobby.",
  "competitive-end": "Everyone taps Ready when done browsing scores. The series continues automatically.",
  "spectator": "You\u2019re watching this game. Tap Ready to Join to play the next one.",
};
