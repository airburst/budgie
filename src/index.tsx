import { createBrowserApplicationApi } from "@/platform/browser-api";
import { initializeWebRuntime } from "@/web/runtime/runtime";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./globals.css";
import "./index.css";

const root = document.getElementById("root")!;

const renderStatus = (title: string, detail: string) => {
  root.innerHTML = `<main style="display:grid;min-height:100vh;place-items:center;padding:2rem;text-align:center"><section><h1>${title}</h1><p>${detail}</p></section></main>`;
};

const renderApp = () =>
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

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
    renderStatus(
      "Budgie could not start",
      error instanceof Error ? error.message : String(error),
    );
  }
};

void start();
