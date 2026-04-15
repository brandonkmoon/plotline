import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import ArchiveView from "@/components/archive/ArchiveView";
import ArchiveNotFound from "@/components/archive/ArchiveNotFound";

interface ArchiveStory {
  storyIndex: number;
  readerName: string;
  prompts: {
    slot: number;
    promptText: string;
    contribution: string;
    authorName: string;
    wasPlaceholder: boolean;
  }[];
}

interface ArchiveRoom {
  code: string;
  createdAt: number;
  completedAt: number;
  playerCount: number;
  storyCount: number;
}

export default async function ArchivePage({
  params,
}: {
  params: { code: string };
}) {
  const code = params.code.toUpperCase();

  const room = db
    .select()
    .from(schema.archivedRooms)
    .where(eq(schema.archivedRooms.code, code))
    .get();

  if (!room) return <ArchiveNotFound />;

  const dbStories = db
    .select()
    .from(schema.archivedStories)
    .where(eq(schema.archivedStories.roomCode, code))
    .all();

  const stories: ArchiveStory[] = [];
  for (const story of dbStories) {
    const prompts = db
      .select()
      .from(schema.archivedPrompts)
      .where(eq(schema.archivedPrompts.storyId, story.id))
      .all();

    stories.push({
      storyIndex: story.storyIndex,
      readerName: story.readerName,
      prompts: prompts
        .sort((a, b) => a.slot - b.slot)
        .map((p) => ({
          slot: p.slot,
          promptText: p.promptText,
          contribution: p.contribution,
          authorName: p.authorName,
          wasPlaceholder: p.wasPlaceholder === 1,
        })),
    });
  }

  stories.sort((a, b) => a.storyIndex - b.storyIndex);

  const archiveRoom: ArchiveRoom = {
    code: room.code,
    createdAt: room.createdAt,
    completedAt: room.completedAt,
    playerCount: room.playerCount,
    storyCount: room.storyCount,
  };

  return <ArchiveView room={archiveRoom} stories={stories} />;
}
