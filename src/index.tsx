import { createBrowserApplicationApi } from "@/platform/browser-api";
import { BrowserDatabaseError } from "@/web/db/browser-database-errors";
import { initializeWebRuntime } from "@/web/runtime/runtime";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./globals.css";
import "./index.css";

const root = document.getElementById("root")!;

const renderStatus = (title: string, detail: string, retry?: () => void) => {
  root.replaceChildren();
  const main = document.createElement("main");
  main.style.cssText =
    "display:grid;min-height:100vh;place-items:center;padding:2rem;text-align:center";
  const section = document.createElement("section");
  const heading = document.createElement("h1");
  heading.textContent = title;
  const paragraph = document.createElement("p");
  paragraph.textContent = detail;
  section.append(heading, paragraph);
  if (retry) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Try again";
    button.addEventListener("click", retry, { once: true });
    section.append(button);
  }
  main.append(section);
  root.append(main);
};

const renderApp = () =>
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

const registerBrowserServiceWorker = () => {
  if (window.api || !window.isSecureContext || !("serviceWorker" in navigator))
    return;
  void navigator.serviceWorker
    .register(`./sw.js?version=${encodeURIComponent(__APP_VERSION__)}`, {
      scope: "./",
    })
    .then((registration) => {
      const announceUpdate = () => {
        if (registration.waiting && navigator.serviceWorker.controller) {
          window.dispatchEvent(
            new CustomEvent("budgie:service-worker-update", {
              detail: registration,
            }),
          );
        }
      };
      registration.addEventListener("updatefound", () => {
        registration.installing?.addEventListener("statechange", () => {
          if (registration.installing?.state === "installed") announceUpdate();
        });
      });
      announceUpdate();
      window.addEventListener("online", () => void registration.update());
    });
};

const startupFailure = (error: unknown) => {
  if (!(error instanceof BrowserDatabaseError)) {
    return {
      title: "Budgie could not start",
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  const messages = {
    "opfs-unavailable": [
      "Browser storage is unavailable",
      "Budgie needs Origin Private File System storage to open its local database.",
    ],
    "private-browsing": [
      "Private browsing is not supported",
      "Open Budgie in a regular browser window to use local financial data.",
    ],
    quota: [
      "Browser storage is full",
      "Free space in this browser and try again.",
    ],
    corruption: [
      "The local database could not be opened",
      "Use a recent export to recover your data, then try again.",
    ],
    migration: [
      "The database update could not be completed",
      "Try again. Your existing local data was left untouched.",
    ],
    worker: [
      "The database worker stopped",
      "Try again to restart the browser database.",
    ],
    unknown: ["Budgie could not start", error.message],
  } as const;
  const [title, detail] = messages[error.code];
  return { title, detail };
};

const start = async () => {
  if (window.api) {
    renderApp();
    return;
  }

  try {
    const runtime = await initializeWebRuntime();
    if (!runtime) {
      renderStatus(
        "Budgie is already open",
        "Close the other Budgie tab before using this one.",
      );
      return;
    }
    registerBrowserServiceWorker();
    window.api = createBrowserApplicationApi(runtime.database);
    const resume = () => {
      if (document.visibilityState === "visible") void runtime.resume();
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener(
      "beforeunload",
      () => {
        document.removeEventListener("visibilitychange", resume);
        void runtime.shutdown();
      },
      { once: true },
    );
    renderApp();
  } catch (error) {
    const failure = startupFailure(error);
    renderStatus(failure.title, failure.detail, () => void start());
  }
};

void start();
