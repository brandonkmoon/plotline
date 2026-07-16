import { routePartykitRequest } from "partyserver";
import RoomServer from "./room";
import type { Env } from "./env";

// Wrangler needs the Durable Object class exported by name from the entry module.
export { RoomServer };

// Worker entry. routePartykitRequest matches partysocket's default path
// (/parties/main/:room) against the "Main" DO binding and forwards the upgrade.
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (
      (await routePartykitRequest(request, env)) ||
      new Response("Not Found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
