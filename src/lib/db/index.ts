import * as schema from "./schema";

export { schema };

let database: any = null;

export async function getDb() {
  if (!database) {
    const { drizzle } = await import("drizzle-orm/libsql");

    let client: any;
    if (process.env.TURSO_DATABASE_URL) {
      // Production: use web client (no native bindings, works on Vercel)
      const { createClient } = await import("@libsql/client/web");
      client = createClient({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
      });
    } else {
      // Local dev: use native client (supports file: URLs)
      const { createClient } = await import("@libsql/client");
      client = createClient({
        url: "file:plotline.db",
      });
    }

    database = drizzle(client, { schema });
  }
  return database;
}
