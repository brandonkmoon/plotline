import type { Prompt } from "./types";

export const PROMPTS: Prompt[] = [
  { index: 0, text: "Pick someone in this room. Who are they really?" },
  { index: 1, text: "Pick someone else. What\u2019s their deal?" },
  { index: 2, text: "Where are they?" },
  { index: 3, text: "What are they doing?" },
  { index: 4, text: "What does the first one say?" },
  { index: 5, text: "What does the other one say back?" },
  { index: 6, text: "How does it end?" },
];

/** Whether a round uses the name-picker UI (tap a name, then write a descriptor). */
export function isNamePickerRound(promptIndex: number): boolean {
  return promptIndex === 0 || promptIndex === 1;
}

/** Hint text shown below the prompt on name-picker rounds. */
export const NAME_PICKER_HINTS: Record<number, string> = {
  0: "a retired sword swallower with trust issues",
  1: "a suspiciously calm nun who knows too much",
};

/** Placeholder examples for the descriptor input on name-picker rounds. */
export const DESCRIPTOR_PLACEHOLDERS: Record<number, string[]> = {
  0: [
    "a retired sword swallower with trust issues",
    "the world's least convincing spy",
    "a disappointed astronaut",
  ],
  1: [
    "a suspiciously calm nun who knows too much",
    "an unlicensed magician",
    "a very polite bank robber",
  ],
};

/** Placeholder examples for free-text rounds (3-7).
 *  These model the correct tense and phrasing so players imitate the style.
 *  Template: "[Name1] and [Name2] are [location], [action].
 *            [Name1] says, '[dialogue]' [Name2] says, '[dialogue]'
 *            Then, [ending]."
 */
export const PLACEHOLDERS: Record<number, string[]> = {
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
    "I swear this isn't what it looks like.",
    "Do you think pigeons have feelings?",
    "I left the oven on... three days ago.",
  ],
  5: [
    "That explains the smell.",
    "Bold of you to assume I care.",
    "I knew this would happen eventually.",
  ],
  6: [
    "they are never seen again",
    "everything catches fire",
    "they both pretend it never happened",
    "a tumbleweed rolls by and nobody moves",
  ],
};

export function getRandomPlaceholder(promptIndex: number): string {
  // Name-picker rounds: return a full "Name — descriptor" placeholder
  if (isNamePickerRound(promptIndex)) {
    const descriptors = DESCRIPTOR_PLACEHOLDERS[promptIndex];
    const names = ["Dave", "Brenda", "Gerald", "Captain Socks"];
    const name = names[Math.floor(Math.random() * names.length)];
    const desc = descriptors?.[Math.floor(Math.random() * descriptors.length)] ?? "the mysterious";
    return `${name} — ${desc}`;
  }

  const options = PLACEHOLDERS[promptIndex];
  if (!options || options.length === 0) {
    return "(no response)";
  }
  return options[Math.floor(Math.random() * options.length)];
}
