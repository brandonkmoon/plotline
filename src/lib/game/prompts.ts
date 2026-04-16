import type { Prompt } from "./types";

export const PROMPTS: Prompt[] = [
  { index: 0, text: "Name a player (optional descriptor)" },
  { index: 1, text: "Name another player (optional descriptor)" },
  { index: 2, text: "Where are they? (e.g., 'at the zoo' or 'underwater')" },
  { index: 3, text: "What are they doing? (e.g., 'baking cookies' or 'dancing on tables')" },
  { index: 4, text: "The first one says\u2026" },
  { index: 5, text: "The second one says\u2026" },
  { index: 6, text: "Then what?" },
];

export const PLACEHOLDERS: Record<number, string[]> = {
  0: [
    "Dave the mysterious",
    "Captain Socks",
    "A confused penguin named Gerald",
  ],
  1: [
    "Brenda the magnificent",
    "Sir Wobblesworth",
    "An overconfident squirrel",
  ],
  2: [
    "at an IKEA at 3am",
    "inside a giant burrito",
    "on the moon, somehow",
    "in a very long checkout line",
  ],
  3: [
    "aggressively folding laundry",
    "trying to teach a cat algebra",
    "having a staring contest",
    "building a fort out of pancakes",
  ],
  4: [
    '"I swear this isn\'t what it looks like."',
    '"Do you think pigeons have feelings?"',
    '"I left the oven on... three days ago."',
  ],
  5: [
    '"That explains the smell."',
    '"Bold of you to assume I care."',
    '"I knew this would happen eventually."',
  ],
  6: [
    "They were never seen again.",
    "And then everything caught fire.",
    "They both pretended it never happened.",
    "A tumbleweed rolled by. Nobody moved.",
  ],
};

export function getRandomPlaceholder(promptIndex: number): string {
  const options = PLACEHOLDERS[promptIndex];
  if (!options || options.length === 0) {
    return "(no response)";
  }
  return options[Math.floor(Math.random() * options.length)];
}
