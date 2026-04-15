import * as schema from "./schema";

export { schema };

// Fully lazy database initialization — @libsql/client is only
// dynamically imported when getDb() is first called, preventing
// any native binding resolution during Next.js static generation.

let database: any = null;

export async function getDb() {
  if (!database) {
    const { createClient } = await import("@libsql/client");
    const { drizzle } = await import("drizzle-orm/libsql");

    const client = createClient(
      process.env.TURSO_DATABASE_URL
        ? {
            url: process.env.TURSO_DATABASE_URL,
            authToken: process.env.TURSO_AUTH_TOKEN,
          }
        : {
            url: "file:plotline.db",
          }
    );

    database = drizzle(client, { schema });
  }
  return database;
}
