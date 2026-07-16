import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Inline partyserver so Vite transforms it and the cloudflare:workers alias
    // below applies inside it (otherwise node's ESM loader hits the cloudflare:
    // protocol directly and throws).
    server: {
      deps: {
        inline: ["partyserver"],
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // partyserver imports DurableObject from the Workers-only virtual module;
      // stub it so RoomServer can be constructed under node.
      "cloudflare:workers": path.resolve(
        __dirname,
        "./src/test/cloudflare-workers-shim.ts"
      ),
    },
  },
});
