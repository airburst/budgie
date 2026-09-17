import type {
  BrowserDatabaseReady,
  BrowserDatabaseResponse,
} from "./browser-database-worker";

export const initializeBrowserDatabase = (
  filename = "budgie-web.sqlite3",
): Promise<BrowserDatabaseReady> =>
  new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./browser-database-worker.ts", import.meta.url),
      { type: "module" },
    );

    worker.addEventListener(
      "message",
      (event: MessageEvent<BrowserDatabaseResponse>) => {
        worker.terminate();
        if (event.data.type === "error") reject(new Error(event.data.message));
        else resolve(event.data);
      },
    );
    worker.addEventListener("error", (event) => {
      worker.terminate();
      reject(event.error ?? new Error(event.message));
    });
    worker.postMessage({ type: "initialize", filename });
  });
