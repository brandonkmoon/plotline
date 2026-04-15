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

  const rooms = await db
    .select()
    .from(schema.archivedRooms)
    .where(eq(schema.archivedRooms.code, code));

  const room = rooms[0];

  if (!room) return <ArchiveNotFound />;

  const dbStories = await db
    .select()
    .from(schema.archivedStories)
    .where(eq(schema.archivedStories.roomCode, code));

  const stories: ArchiveStory[] = [];
  for (const story of dbStories) {
    const prompts = await db
      .select()
      .from(schema.archivedPrompts)
      .where(eq(schema.archivedPrompts.storyId, story.id));

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
