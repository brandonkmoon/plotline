// The server reads `process.env.NODE_ENV` for dev-only logging. On the Workers
// runtime `process` is provided by the `nodejs_compat` flag (NODE_ENV is
// undefined there, so those logs simply no-op). This minimal ambient type keeps
// the Workers tsconfig — which uses @cloudflare/workers-types, not @types/node —
// from pulling in Node's global typings (which clash with the Workers globals).
declare const process: { env: Record<string, string | undefined> };
