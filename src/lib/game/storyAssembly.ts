import type { Room, AssembledStory } from "./types";
import { PROMPTS, getRandomPlaceholder } from "./prompts";

export function assembleStories(room: Room): AssembledStory[] {
  return room.stories.map((story) => {
    const responses = story.slots.map((slot) => {
      if (slot.response !== null) {
        return slot.response;
      }
      return getRandomPlaceholder(slot.promptIndex);
    });

    const prompts = PROMPTS.map((p) => p.text);

    return {
      storyIndex: story.index,
      responses,
      prompts,
    };
  });
}
