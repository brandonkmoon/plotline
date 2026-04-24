import type { Room, StoryVoteResult } from "@/lib/game/types";
import { PROMPTS, getRandomPlaceholder } from "@/lib/game/prompts";

export interface ArchivePromptData {
  slot: number;
  promptText: string;
  contribution: string;
  authorName: string;
  wasPlaceholder: boolean;
  points?: number; // competitive mode: points this line received
}

export interface ArchiveStoryData {
  storyIndex: number;
  readerName: string;
  prompts: ArchivePromptData[];
}

export interface ArchiveData {
  room: {
    code: string;
    createdAt: number;
    completedAt: number;
    playerCount: number;
    storyCount: number;
  };
  stories: ArchiveStoryData[];
}

export function serializeRoomForArchive(
  room: Room,
  voteResults?: StoryVoteResult[]
): ArchiveData {
  const playerMap = new Map(room.players.map((p) => [p.id, p.name]));

  // Pre-compute points per line per story from vote results
  const pointsByStory: Record<number, number[]> = {};
  if (voteResults) {
    for (const result of voteResults) {
      const pts = new Array(7).fill(0);
      for (const vote of result.votes) {
        pts[vote.lineIndex] += vote.isStandingOvation ? 3 : 1;
      }
      pointsByStory[result.storyIndex] = pts;
    }
  }

  const stories: ArchiveStoryData[] = room.stories.map((story) => {
    // The reader is the player who wrote prompt 6 (the last prompt, "Then what?")
    const lastSlot = story.slots.find((s) => s.promptIndex === 6);
    const readerName = lastSlot?.playerId
      ? playerMap.get(lastSlot.playerId) ?? "Unknown"
      : "Unknown";

    const prompts: ArchivePromptData[] = story.slots.map((slot) => {
      const wasPlaceholder =
        slot.isPlaceholder || slot.response === null;
      const contribution = slot.response ?? getRandomPlaceholder(slot.promptIndex);
      const authorName = slot.playerId
        ? playerMap.get(slot.playerId) ?? "Unknown"
        : "Unknown";

      return {
        slot: slot.promptIndex + 1,
        promptText: PROMPTS[slot.promptIndex].text,
        contribution,
        authorName,
        wasPlaceholder,
        points: pointsByStory[story.index]?.[slot.promptIndex] ?? 0,
      };
    });

    return {
      storyIndex: story.index,
      readerName,
      prompts,
    };
  });

  return {
    room: {
      code: room.code,
      createdAt: room.createdAt,
      completedAt: room.updatedAt,
      playerCount: room.players.length,
      storyCount: room.stories.length,
    },
    stories,
  };
}
