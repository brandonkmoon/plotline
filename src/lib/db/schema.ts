import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const archivedRooms = sqliteTable("archived_rooms", {
  code: text("code").primaryKey(),
  createdAt: integer("created_at").notNull(),
  completedAt: integer("completed_at").notNull(),
  playerCount: integer("player_count").notNull(),
  storyCount: integer("story_count").notNull(),
});

export const archivedStories = sqliteTable("archived_stories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  roomCode: text("room_code")
    .notNull()
    .references(() => archivedRooms.code),
  storyIndex: integer("story_index").notNull(),
  readerName: text("reader_name").notNull(),
  createdAt: integer("created_at").notNull(),
  souvenirVideoUrl: text("souvenir_video_url"),
});

export const archivedPrompts = sqliteTable("archived_prompts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  storyId: integer("story_id")
    .notNull()
    .references(() => archivedStories.id),
  slot: integer("slot").notNull(),
  promptText: text("prompt_text").notNull(),
  contribution: text("contribution").notNull(),
  authorName: text("author_name").notNull(),
  wasPlaceholder: integer("was_placeholder").notNull().default(0),
});
