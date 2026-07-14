export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import type { ArchiveData } from "@/lib/archive/serialize";

export async function POST(request: NextRequest) {
  // Only the PartyKit server may write archives. It sends a shared secret;
  // the browser cannot. If ARCHIVE_SECRET is configured (on Vercel AND the
  // PartyKit server), require it. Until it's set on both, the endpoint stays
  // open — so set it as part of the archive-auth rollout, not before.
  const archiveSecret = process.env.ARCHIVE_SECRET;
  if (archiveSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${archiveSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    console.warn(
      "[archive] ARCHIVE_SECRET is not set — the archive endpoint is unauthenticated"
    );
  }

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

  // A real game has at most 10 stories (one per player) of 7 prompts each.
  // Reject anything wildly larger as a cheap guard against payload abuse.
  const totalPrompts = body.stories.reduce(
    (n, s) => n + (Array.isArray(s.prompts) ? s.prompts.length : 0),
    0
  );
  if (body.stories.length > 12 || totalPrompts > 120) {
    return NextResponse.json(
      { error: "Archive payload too large" },
      { status: 413 }
    );
  }

  // Readers look archives up by an uppercased code (see /archive/[code] and
  // the OG route), so we must store it uppercased too — a lowercase code
  // here would create an archive that can never be reached.
  const roomCode = body.room.code.toUpperCase();

  try {
    const db = await getDb();
    await db.transaction(async (tx: any) => {
      // Upsert: delete existing data for this room code first
      const existingRooms = await tx
        .select()
        .from(schema.archivedRooms)
        .where(eq(schema.archivedRooms.code, roomCode));

      if (existingRooms.length > 0) {
        // Get existing story IDs to delete their prompts
        const existingStories = await tx
          .select()
          .from(schema.archivedStories)
          .where(eq(schema.archivedStories.roomCode, roomCode));

        for (const story of existingStories) {
          await tx
            .delete(schema.archivedPrompts)
            .where(eq(schema.archivedPrompts.storyId, story.id));
        }

        await tx
          .delete(schema.archivedStories)
          .where(eq(schema.archivedStories.roomCode, roomCode));

        await tx
          .delete(schema.archivedRooms)
          .where(eq(schema.archivedRooms.code, roomCode));
      }

      // Insert room
      await tx.insert(schema.archivedRooms).values({
        code: roomCode,
        createdAt: body.room.createdAt,
        completedAt: body.room.completedAt,
        playerCount: body.room.playerCount,
        storyCount: body.room.storyCount,
      });

      // Batch-insert every story in one statement, then map each story's
      // index to the id the DB generated for it.
      const insertedStories = await tx
        .insert(schema.archivedStories)
        .values(
          body.stories.map((story) => ({
            roomCode,
            storyIndex: story.storyIndex,
            readerName: story.readerName,
            createdAt: body.room.completedAt,
          }))
        )
        .returning();

      const storyIdByIndex = new Map<number, number>(
        insertedStories.map((s: { id: number; storyIndex: number }) => [
          s.storyIndex,
          s.id,
        ])
      );

      // Flatten every story's prompts into a single multi-row insert.
      const promptRows = body.stories.flatMap((story) =>
        story.prompts.map((prompt) => ({
          storyId: storyIdByIndex.get(story.storyIndex)!,
          slot: prompt.slot,
          promptText: prompt.promptText,
          contribution: prompt.contribution,
          authorName: prompt.authorName,
          wasPlaceholder: prompt.wasPlaceholder ? 1 : 0,
          points: prompt.points ?? 0,
        }))
      );

      if (promptRows.length > 0) {
        await tx.insert(schema.archivedPrompts).values(promptRows);
      }
    });

    return NextResponse.json({
      archiveUrl: `/archive/${roomCode}`,
    });
  } catch (error) {
    console.error("Failed to archive room:", error);
    return NextResponse.json(
      { error: "Failed to archive room" },
      { status: 500 }
    );
  }
}
