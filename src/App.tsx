import RouterContent from "@/components/RouterContent";
import { Toaster } from "@/components/ui/sonner";
import { usePlatform } from "@/hooks/usePlatform";
import { usePreferences } from "@/hooks/usePreferences";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { HashRouter } from "react-router";
import { toast } from "sonner";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 },
  },
});

function ThemeApplier() {
  const { preferences } = usePreferences();
  const theme = preferences.theme ?? "auto";

  useEffect(() => {
    if (theme === "light") {
      document.documentElement.classList.remove("dark");
      return;
    }
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
      return;
    }
    // auto: follow system preference
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    document.documentElement.classList.toggle("dark", mq.matches);
    const handler = (e: MediaQueryListEvent) => {
      document.documentElement.classList.toggle("dark", e.matches);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  return null;
}

function UpdateListener() {
  const platform = usePlatform();

  useEffect(() => {
    if (platform.capabilities.nativeUpdates) {
      window.api.onUpdateAvailable((version) => {
        toast.info(`Version ${version} available`, {
          duration: Infinity,
          action: {
            label: "Download",
            onClick: () => {
              void window.api.openExternal(
                "https://github.com/airburst/budgie/releases/latest",
              );
            },
          },
        });
      });

      window.api.onUpdateDownloaded((version) => {
        toast.info(`Version ${version} available`, {
          duration: Infinity,
          action: {
            label: "Restart",
            onClick: () => window.api.restartToUpdate(),
          },
        });
      });

      window.api.onUpdateNotAvailable(() => {
        toast.success("Budgie is up to date");
      });
      return;
    }

    const onServiceWorkerUpdate = (event: Event) => {
      const registration = (event as CustomEvent<ServiceWorkerRegistration>)
        .detail;
      toast.info("A new Budgie version is ready", {
        duration: Infinity,
        action: {
          label: "Update",
          onClick: () => {
            registration.waiting?.postMessage({ type: "SKIP_WAITING" });
            navigator.serviceWorker.addEventListener(
              "controllerchange",
              () => window.location.reload(),
              { once: true },
            );
          },
        },
      });
    };
    window.addEventListener(
      "budgie:service-worker-update",
      onServiceWorkerUpdate,
    );
    return () =>
      window.removeEventListener(
        "budgie:service-worker-update",
        onServiceWorkerUpdate,
      );
  }, [platform.capabilities.nativeUpdates]);
  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <ThemeApplier />
        <UpdateListener />
        <RouterContent />
      </HashRouter>
      <Toaster position="bottom-right" />
    </QueryClientProvider>
  );
}

export default App;
