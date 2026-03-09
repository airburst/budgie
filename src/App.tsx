import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, useEffect } from "react";
import { HashRouter, Route, Routes } from "react-router";

const AccountTransactions = lazy(
  () => import("@/pages/AccountTransactions/AccountTransactions"),
);
const Categories = lazy(() => import("@/pages/Categories/Categories"));
const ForecastPage = lazy(() => import("@/pages/Forecast/ForecastPage"));
const Home = lazy(() => import("@/pages/Home/Home"));
const Payees = lazy(() => import("@/pages/Payees/Payees"));
const ReconcilePage = lazy(
  () => import("@/pages/Reconcile/ReconcilePage"),
);
const ScheduledTransactions = lazy(
  () => import("@/pages/ScheduledTransactions/ScheduledTransactions"),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 },
  },
});

function App() {
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      document.documentElement.classList.toggle("dark", e.matches);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <Suspense>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/accounts/:id" element={<AccountTransactions />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/payees" element={<Payees />} />
            <Route path="/scheduled" element={<ScheduledTransactions />} />
            <Route path="/reconcile/:id" element={<ReconcilePage />} />
            <Route path="/forecast/:id" element={<ForecastPage />} />
          </Routes>
        </Suspense>
      </HashRouter>
    </QueryClientProvider>
  );
}

export default App;
