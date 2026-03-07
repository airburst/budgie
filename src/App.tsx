import AccountTransactions from "@/pages/AccountTransactions/AccountTransactions";
import Categories from "@/pages/Categories/Categories";
import ForecastPage from "@/pages/Forecast/ForecastPage";
import Home from "@/pages/Home/Home";
import ScheduledTransactions from "@/pages/ScheduledTransactions/ScheduledTransactions";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { HashRouter, Route, Routes } from "react-router";

const queryClient = new QueryClient();

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
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/accounts/:id" element={<AccountTransactions />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/scheduled" element={<ScheduledTransactions />} />
          <Route path="/forecast/:id" element={<ForecastPage />} />
        </Routes>
      </HashRouter>
    </QueryClientProvider>
  );
}

export default App;
