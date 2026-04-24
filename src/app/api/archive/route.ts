export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import type { ArchiveData } from "@/lib/archive/serialize";

export async function POST(request: NextRequest) {
  let body: ArchiveData;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (
    !body.room ||
    !body.room.code ||
    !body.stories ||
    !Array.isArray(body.stories)
  ) {
    return NextResponse.json(
      { error: "Invalid archive data" },
      { status: 400 }
    );
  }

  try {
    const db = await getDb();
    await db.transaction(async (tx: any) => {
      // Upsert: delete existing data for this room code first
      const existingRooms = await tx
        .select()
        .from(schema.archivedRooms)
        .where(eq(schema.archivedRooms.code, body.room.code));

      if (existingRooms.length > 0) {
        // Get existing story IDs to delete their prompts
        const existingStories = await tx
          .select()
          .from(schema.archivedStories)
          .where(eq(schema.archivedStories.roomCode, body.room.code));

        for (const story of existingStories) {
          await tx
            .delete(schema.archivedPrompts)
            .where(eq(schema.archivedPrompts.storyId, story.id));
        }

        await tx
          .delete(schema.archivedStories)
          .where(eq(schema.archivedStories.roomCode, body.room.code));

        await tx
          .delete(schema.archivedRooms)
          .where(eq(schema.archivedRooms.code, body.room.code));
      }

      // Insert room
      await tx.insert(schema.archivedRooms).values({
        code: body.room.code,
        createdAt: body.room.createdAt,
        completedAt: body.room.completedAt,
        playerCount: body.room.playerCount,
        storyCount: body.room.storyCount,
      });

      // Insert stories and prompts
      for (const story of body.stories) {
        const storyResults = await tx
          .insert(schema.archivedStories)
          .values({
            roomCode: body.room.code,
            storyIndex: story.storyIndex,
            readerName: story.readerName,
            createdAt: body.room.completedAt,
          })
          .returning();

        const storyResult = storyResults[0];

        for (const prompt of story.prompts) {
          await tx.insert(schema.archivedPrompts).values({
            storyId: storyResult.id,
            slot: prompt.slot,
            promptText: prompt.promptText,
            contribution: prompt.contribution,
            authorName: prompt.authorName,
            wasPlaceholder: prompt.wasPlaceholder ? 1 : 0,
            points: prompt.points ?? 0,
          });
        }
      }
    });

    return NextResponse.json({
      archiveUrl: `/archive/${body.room.code}`,
    });
  } catch (error) {
    console.error("Failed to archive room:", error);
    return NextResponse.json(
      { error: "Failed to archive room" },
      { status: 500 }
    );
  }
}
