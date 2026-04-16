import type { Room, AssembledStory, NarrativeSection } from "./types";
import { PROMPTS, getRandomPlaceholder } from "./prompts";
import { normalizeLocation, normalizeAction, normalizeDialogue, normalizeEnding } from "./normalize";

export function assembleStories(room: Room): AssembledStory[] {
  return room.stories.map((story) => {
    const responses = story.slots.map((slot) => {
      return slot.response !== null ? slot.response : getRandomPlaceholder(slot.promptIndex);
    });

    const player1 = responses[0];
    const player2 = responses[1];
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
      { text: player1, style: 'name' },
      { text: `and ${player2}`, style: 'name' },
      { text: `are ${location},`, style: 'location' },
      { text: `${action}.`, style: 'action' },
      { text: `${player1} says, "${dialogue1}"`, style: 'dialogue', speakerName: player1 },
      { text: `${player2} says, "${dialogue2}"`, style: 'dialogue', speakerName: player2 },
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
