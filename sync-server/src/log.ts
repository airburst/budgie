// Request logging (SPEC 2.6): ids, route, status, counts and reasons only.
// Nothing from a body, header or query string is ever added here.

export interface LogContext {
  userId?: string;
  deviceId?: string;
  counts?: Record<string, number>;
  /** An error code or rejection reason. */
  reason?: string;
}

export type LogSink = (line: string) => void;

export const consoleSink: LogSink = (line) => console.log(line);

export function writeLog(
  sink: LogSink,
  route: string,
  method: string,
  status: number,
  ctx: LogContext,
): void {
  sink(
    JSON.stringify({
      route,
      method,
      status,
      userId: ctx.userId,
      deviceId: ctx.deviceId,
      counts: ctx.counts,
      reason: ctx.reason,
    }),
  );
}
