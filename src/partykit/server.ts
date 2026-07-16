import { routePartykitRequest } from "partyserver";
import RoomServer from "./room";
import type { Env } from "./env";

// Wrangler needs the Durable Object class exported by name from the entry module.
export { RoomServer };

// Worker entry. routePartykitRequest matches partysocket's default path
// (/parties/main/:room) against the "Main" DO binding and forwards the upgrade.
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Per-IP connection rate limit — blunts room-code sweeps and connection
    // floods across rooms (each room is its own Durable Object, so this can
    // only be enforced here at the entry). Fails open if the binding is absent
    // (local dev / tests).
    if (env.CONNECT_LIMITER) {
      const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
      const { success } = await env.CONNECT_LIMITER.limit({ key: ip });
      if (!success) {
        return new Response("Too Many Requests", { status: 429 });
      }
    }

    return (
      (await routePartykitRequest(request, env)) ||
      new Response("Not Found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
