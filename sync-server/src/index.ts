import { handleRequest } from "./app";
import { createD1Executor, type D1DatabaseLike } from "./d1-executor";
import { MemoryIpLimiter } from "./limits";
import { FailedAttemptGuard } from "./rate-limit";
import { runSnapshots } from "./snapshot";
import { createR2Store, type R2BucketLike } from "./store";

export interface Env {
  DB: D1DatabaseLike;
  SNAPSHOTS: R2BucketLike;
  /** The web app origin that gets CORS headers, e.g. https://budget.fairhursts.net */
  ALLOWED_ORIGIN?: string;
  /** "1" only in wrangler.local.jsonc. Never set in the deployed config. */
  DEV_MODE?: string;
}

/** Added to the allowed origins only when DEV_MODE is set (Vite dev server). */
export const DEV_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"];

export function allowedOrigins(env: Env): string[] {
  const list = env.ALLOWED_ORIGIN ? [env.ALLOWED_ORIGIN] : [];
  return env.DEV_MODE === "1" ? [...list, ...DEV_ORIGINS] : list;
}

let devSchemaReady: Promise<void> | undefined;
// One limiter per isolate; see README for what that means.
const ipLimiter = new MemoryIpLimiter();
const enrolGuard = new FailedAttemptGuard();

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const executor = createD1Executor(env.DB);
    const devMode = env.DEV_MODE === "1";
    if (devMode) {
      // Loaded lazily; it never runs unless DEV_MODE is set.
      const { ensureDevSchema } = await import("./dev-bootstrap");
      devSchemaReady ??= ensureDevSchema(executor);
      await devSchemaReady;
    }
    return handleRequest(request, {
      executor,
      now: Date.now,
      devMode,
      allowedOrigins: allowedOrigins(env),
      ipLimiter,
      enrolGuard,
      store: createR2Store(env.SNAPSHOTS),
    });
  },

  /** Cron trigger: daily snapshots (SY-019). */
  async scheduled(_event: unknown, env: Env): Promise<void> {
    await runSnapshots(
      createD1Executor(env.DB),
      createR2Store(env.SNAPSHOTS),
      Date.now(),
      (line) => console.log(line),
    );
  },
};
