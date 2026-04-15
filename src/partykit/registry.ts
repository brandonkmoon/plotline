import type * as Party from "partykit/server";
import type { RegistryMessage, RegistryResponse } from "@/lib/multiplayer/types";

const CODE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export default class RegistryServer implements Party.Server {
  room: Party.Room;
  activeCodes: Map<string, number> = new Map(); // code -> timestamp
  cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(room: Party.Room) {
    this.room = room;

    // Periodically clean up old codes
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, CLEANUP_INTERVAL_MS);
  }

  onMessage(message: string, sender: Party.Connection) {
    let msg: RegistryMessage;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }

    switch (msg.type) {
      case "REGISTER":
        this.activeCodes.set(msg.code, Date.now());
        break;

      case "UNREGISTER":
        this.activeCodes.delete(msg.code);
        break;

      case "CHECK": {
        const response: RegistryResponse = {
          type: "CHECK_RESULT",
          code: msg.code,
          exists: this.activeCodes.has(msg.code),
        };
        sender.send(JSON.stringify(response));
        break;
      }

      case "GET_ALL": {
        this.cleanup(); // Clean before returning
        const response: RegistryResponse = {
          type: "ALL_CODES",
          codes: Array.from(this.activeCodes.keys()),
        };
        sender.send(JSON.stringify(response));
        break;
      }
    }
  }

  private cleanup() {
    const now = Date.now();
    for (const [code, timestamp] of this.activeCodes) {
      if (now - timestamp > CODE_TTL_MS) {
        this.activeCodes.delete(code);
      }
    }
  }

  onClose() {
    // Connection closed, nothing to do
  }
}
