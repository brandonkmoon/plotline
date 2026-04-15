import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";

const sqlite = new Database(path.join(process.cwd(), "plotline.db"));
sqlite.pragma("journal_mode = WAL");
export const db = drizzle(sqlite, { schema });
export { schema };
