import type {
  DatabaseCapability,
  DatabaseRow,
  DatabaseStatement,
  DatabaseTransaction,
} from "@/platform/database";
import type {
  BrowserDatabaseCommand,
  BrowserDatabaseReady,
  BrowserDatabaseRequest,
  BrowserDatabaseResponse,
} from "./browser-database-worker";

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

export type BrowserDatabase = DatabaseCapability & {
  ready: Promise<BrowserDatabaseReady>;
};

export const createBrowserDatabase = (
  filename = "budgie-web.sqlite3",
): BrowserDatabase => {
  const worker = new Worker(
    new URL("./browser-database-worker.ts", import.meta.url),
    { type: "module" },
  );
  const pending = new Map<number, Pending>();
  let nextId = 1;
  let queue: Promise<unknown>;

  worker.addEventListener(
    "message",
    (event: MessageEvent<BrowserDatabaseResponse>) => {
      const request = pending.get(event.data.id);
      if (!request) return;
      pending.delete(event.data.id);
      if (event.data.type === "error") {
        request.reject(new Error(event.data.message));
      } else if (event.data.type === "result") {
        request.resolve(event.data.value);
      } else {
        request.resolve(event.data);
      }
    },
  );
  worker.addEventListener("error", (event) => {
    const error = event.error ?? new Error(event.message);
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  });

  const send = <T>(request: BrowserDatabaseCommand): Promise<T> => {
    const id = nextId++;
    return new Promise<T>((resolve, reject) => {
      pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
      });
      worker.postMessage({ id, ...request } as BrowserDatabaseRequest);
    });
  };

  const serialize = <T>(operation: () => Promise<T>): Promise<T> => {
    const next = queue.then(operation);
    queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };

  const ready = send<BrowserDatabaseReady>({ type: "initialize", filename });
  queue = ready.then(() => undefined);
  const execute = (statement: DatabaseStatement) =>
    serialize(() => send<void>({ type: "execute", statement }));
  const query = <T extends DatabaseRow = DatabaseRow>(
    statement: DatabaseStatement,
  ) => serialize(() => send<T[]>({ type: "query", statement }));
  const transaction = <T>(
    operation: (transaction: DatabaseTransaction) => Promise<T>,
  ) =>
    serialize(async () => {
      await send<void>({ type: "begin" });
      const handle: DatabaseTransaction = {
        execute: (statement) => send<void>({ type: "execute", statement }),
        query: <Row extends DatabaseRow>(statement: DatabaseStatement) =>
          send<Row[]>({ type: "query", statement }),
      };
      try {
        const result = await operation(handle);
        await send<void>({ type: "commit" });
        return result;
      } catch (error) {
        await send<void>({ type: "rollback" });
        throw error;
      }
    });

  return {
    ready,
    execute,
    query,
    transaction,
    migrate: async () => {
      await ready;
    },
    close: async () => {
      await serialize(() => send<void>({ type: "close" }));
      worker.terminate();
    },
  };
};
