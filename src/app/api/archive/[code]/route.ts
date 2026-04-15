import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function GET(
  _request: NextRequest,
  { params }: { params: { code: string } }
) {
  const code = params.code.toUpperCase();

  const room = db
    .select()
    .from(schema.archivedRooms)
    .where(eq(schema.archivedRooms.code, code))
    .get();

  if (!room) {
    return NextResponse.json({ error: "Archive not found" }, { status: 404 });
  }

  const stories = db
    .select()
    .from(schema.archivedStories)
    .where(eq(schema.archivedStories.roomCode, code))
    .all();

  const storiesWithPrompts = [];
  for (const story of stories) {
    const prompts = db
      .select()
      .from(schema.archivedPrompts)
      .where(eq(schema.archivedPrompts.storyId, story.id))
      .all();

    storiesWithPrompts.push({
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

  storiesWithPrompts.sort((a, b) => a.storyIndex - b.storyIndex);

  return NextResponse.json({
    room: {
      code: room.code,
      createdAt: room.createdAt,
      completedAt: room.completedAt,
      playerCount: room.playerCount,
      storyCount: room.storyCount,
    },
    stories: storiesWithPrompts,
  });
}
