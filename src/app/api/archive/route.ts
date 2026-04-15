import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
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
    // Use a transaction for atomicity
    const sqliteDb = (db as any).$client;

    const runTransaction = sqliteDb.transaction(() => {
      // Upsert: delete existing data for this room code first
      const existingRoom = db
        .select()
        .from(schema.archivedRooms)
        .where(eq(schema.archivedRooms.code, body.room.code))
        .get();

      if (existingRoom) {
        // Get existing story IDs to delete their prompts
        const existingStories = db
          .select()
          .from(schema.archivedStories)
          .where(eq(schema.archivedStories.roomCode, body.room.code))
          .all();

        for (const story of existingStories) {
          db.delete(schema.archivedPrompts)
            .where(eq(schema.archivedPrompts.storyId, story.id))
            .run();
        }

        db.delete(schema.archivedStories)
          .where(eq(schema.archivedStories.roomCode, body.room.code))
          .run();

        db.delete(schema.archivedRooms)
          .where(eq(schema.archivedRooms.code, body.room.code))
          .run();
      }

      // Insert room
      db.insert(schema.archivedRooms)
        .values({
          code: body.room.code,
          createdAt: body.room.createdAt,
          completedAt: body.room.completedAt,
          playerCount: body.room.playerCount,
          storyCount: body.room.storyCount,
        })
        .run();

      // Insert stories and prompts
      for (const story of body.stories) {
        const storyResult = db
          .insert(schema.archivedStories)
          .values({
            roomCode: body.room.code,
            storyIndex: story.storyIndex,
            readerName: story.readerName,
            createdAt: body.room.completedAt,
          })
          .returning()
          .get();

        for (const prompt of story.prompts) {
          db.insert(schema.archivedPrompts)
            .values({
              storyId: storyResult.id,
              slot: prompt.slot,
              promptText: prompt.promptText,
              contribution: prompt.contribution,
              authorName: prompt.authorName,
              wasPlaceholder: prompt.wasPlaceholder ? 1 : 0,
            })
            .run();
        }
      }
    });

    runTransaction();

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
