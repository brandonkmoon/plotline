import type { Room, AssembledStory, NarrativeSection } from "./types";
import { PROMPTS, getRandomPlaceholder } from "./prompts";
import { normalizeLocation, normalizeAction, normalizeDialogue, normalizeEnding, generateStoryTitle, extractName } from "./normalize";

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

    const title = generateStoryTitle(
      extractName(player1Full),
      extractName(player2Full),
      responses[2]
    );

    return {
      storyIndex: story.index,
      title,
      sections,
      readerName,
      responses,
      prompts: PROMPTS.map(p => p.text),
    };
  });
}
