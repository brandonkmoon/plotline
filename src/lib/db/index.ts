import { drizzle } from "drizzle-orm/libsql";
import { createClient, type Client } from "@libsql/client";
import * as schema from "./schema";

let client: Client | null = null;
let database: ReturnType<typeof drizzle<typeof schema>> | null = null;

function getClient(): Client {
  if (!client) {
    client = createClient(
      process.env.TURSO_DATABASE_URL
        ? {
            url: process.env.TURSO_DATABASE_URL,
            authToken: process.env.TURSO_AUTH_TOKEN,
          }
        : {
            url: "file:plotline.db",
          }
    );
  }
  return client;
}

export function getDb() {
  if (!database) {
    database = drizzle(getClient(), { schema });
  }
  return database;
}

// Keep backward-compatible named export, but lazy
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    return (getDb() as any)[prop];
  },
});

export { schema };
