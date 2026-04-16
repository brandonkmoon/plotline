import type { Config } from "drizzle-kit";

const isTurso = !!process.env.TURSO_DATABASE_URL;

export default {
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: isTurso ? "turso" : "sqlite",
  dbCredentials: isTurso
    ? {
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN,
      }
    : {
        url: "file:plotline.db",
      },
} satisfies Config;
