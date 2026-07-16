// Test-only stub for the `cloudflare:workers` virtual module, which only exists
// on the Workers runtime. partyserver's `Server extends DurableObject` imports
// `DurableObject` (and `env`) from here; under vitest/node we provide a trivial
// base so the class can be constructed. Tests inject a mock `room` facade onto
// the instance afterwards, so the real ctx/env are never exercised.
export class DurableObject {
  ctx: unknown;
  env: unknown;
  constructor(ctx: unknown, env: unknown) {
    this.ctx = ctx;
    this.env = env;
  }
}

export const env = {};
