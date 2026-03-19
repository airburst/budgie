import RouterContent from "@/components/RouterContent";
import { usePreferences } from "@/hooks/usePreferences";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { HashRouter } from "react-router";

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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <ThemeApplier />
        <RouterContent />
      </HashRouter>
    </QueryClientProvider>
  );
}

export default App;
