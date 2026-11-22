import { handleRequest } from "./app";
import { createD1Executor, type D1DatabaseLike } from "./d1-executor";

export interface Env {
  DB: D1DatabaseLike;
  /** "1" only in wrangler.local.jsonc. Never set in the deployed config. */
  DEV_MODE?: string;
}

let devSchemaReady: Promise<void> | undefined;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const executor = createD1Executor(env.DB);
    const devMode = env.DEV_MODE === "1";
    if (devMode) {
      // Loaded lazily so the deployed bundle path never runs it.
      const { ensureDevSchema } = await import("./dev-bootstrap");
      devSchemaReady ??= ensureDevSchema(executor);
      await devSchemaReady;
    }
    return handleRequest(request, { executor, now: Date.now, devMode });
  },
};
