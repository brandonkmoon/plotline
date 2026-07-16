import type RoomServer from "./room";

// Worker environment bindings. `Main` is the Durable Object namespace whose
// binding name (see wrangler.jsonc) kebab-cases to the party name "main" that
// partysocket connects to by default. APP_URL is a plain var; the two secrets
// are set out-of-band via `wrangler secret put` and are optional so local dev
// (and the fail-closed paths) typecheck without them.
export interface Env {
  Main: DurableObjectNamespace<RoomServer>;
  APP_URL: string;
  ARCHIVE_SECRET?: string;
  REVENUECAT_API_KEY?: string;
}
