export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db";
import { eq, inArray } from "drizzle-orm";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const db = await getDb();
  const code = (await params).code.toUpperCase();

  const rooms = await db
    .select()
    .from(schema.archivedRooms)
    .where(eq(schema.archivedRooms.code, code));

  const room = rooms[0];

  if (!room) {
    return NextResponse.json({ error: "Archive not found" }, { status: 404 });
  }

  const stories = await db
    .select()
    .from(schema.archivedStories)
    .where(eq(schema.archivedStories.roomCode, code));

  // Fetch all prompts for these stories in ONE query, then group in memory —
  // avoids an N+1 (one prompts query per story).
  const storyIds = stories.map((s: any) => s.id);
  const allPrompts = storyIds.length
    ? await db
        .select()
        .from(schema.archivedPrompts)
        .where(inArray(schema.archivedPrompts.storyId, storyIds))
    : [];
  const promptsByStory = new Map<unknown, typeof allPrompts>();
  for (const p of allPrompts) {
    const list = promptsByStory.get(p.storyId);
    if (list) list.push(p);
    else promptsByStory.set(p.storyId, [p]);
  }

  const storiesWithPrompts = [];
  for (const story of stories) {
    const prompts = promptsByStory.get(story.id) ?? [];

    storiesWithPrompts.push({
      storyIndex: story.storyIndex,
      readerName: story.readerName,
      prompts: prompts
        .sort((a: any, b: any) => a.slot - b.slot)
        .map((p: any) => ({
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
