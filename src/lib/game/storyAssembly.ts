import type { Room, AssembledStory, NarrativeSection } from "./types";
import { PROMPTS, getRandomPlaceholder } from "./prompts";
import { normalizeLocation, normalizeAction, normalizeDialogue, normalizeEnding } from "./normalize";

/**
 * Extract just the player name from a round 0/1 response.
 * Responses may be "Dave — a retired sword swallower" or just "Dave".
 * Returns the part before the em dash (or en dash, or " - ").
 */
function extractName(nameResponse: string): string {
  // Try em dash first, then en dash, then spaced hyphen
  for (const sep of [" \u2014 ", " \u2013 ", " - "]) {
    const idx = nameResponse.indexOf(sep);
    if (idx !== -1) return nameResponse.slice(0, idx).trim();
  }
  return nameResponse.trim();
}

export function assembleStories(room: Room): AssembledStory[] {
  return room.stories.map((story) => {
    const responses = story.slots.map((slot) => {
      return slot.response !== null ? slot.response : getRandomPlaceholder(slot.promptIndex);
    });

    // Full response includes name + descriptor (e.g. "Dave — a retired spy")
    const player1Full = responses[0];
    const player2Full = responses[1];
    // Short name for dialogue attribution
    const player1Name = extractName(player1Full);
    const player2Name = extractName(player2Full);

    const location = normalizeLocation(responses[2]);
    const action = normalizeAction(responses[3]);
    const dialogue1 = normalizeDialogue(responses[4]);
    const dialogue2 = normalizeDialogue(responses[5]);
    const ending = normalizeEnding(responses[6]);

    // Find who wrote prompt 6 (index 6) — that's the reader
    const readerSlot = story.slots.find(s => s.promptIndex === 6);
    const readerPlayer = readerSlot?.playerId
      ? room.players.find(p => p.id === readerSlot.playerId)
      : null;
    const readerName = readerPlayer?.name ?? "someone";

    const sections: NarrativeSection[] = [
      { text: player1Full, style: 'name' },
      { text: `and ${player2Full}`, style: 'name' },
      { text: `are ${location},`, style: 'location' },
      { text: `${action}.`, style: 'action' },
      { text: `${player1Name} says, "${dialogue1}"`, style: 'dialogue', speakerName: player1Name },
      { text: `${player2Name} says, "${dialogue2}"`, style: 'dialogue', speakerName: player2Name },
      { text: `Then, ${ending}.`, style: 'ending' },
    ];

    return {
      storyIndex: story.index,
      sections,
      readerName,
      responses,
      prompts: PROMPTS.map(p => p.text),
    };
  });
}
