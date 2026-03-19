import { usePreferences } from "@/hooks/usePreferences";
import { lazy, Suspense, useEffect, useRef } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router";

const AccountTransactions = lazy(
  () => import("@/pages/AccountTransactions/AccountTransactions"),
);
const BudgetPage = lazy(() => import("@/pages/Budget/BudgetPage"));
const Categories = lazy(() => import("@/pages/Categories/Categories"));
const ForecastPage = lazy(() => import("@/pages/Forecast/ForecastPage"));
const Home = lazy(() => import("@/pages/Home/Home"));
const Payees = lazy(() => import("@/pages/Payees/Payees"));
const ReconcilePage = lazy(() => import("@/pages/Reconcile/ReconcilePage"));
const ReportsPage = lazy(() => import("@/pages/Reports/ReportsPage"));
const ScheduledTransactions = lazy(
  () => import("@/pages/ScheduledTransactions/ScheduledTransactions"),
);
const SettingsPage = lazy(() => import("@/pages/Settings/SettingsPage"));

function StartupNavigator() {
  const { preferences } = usePreferences();
  const navigate = useNavigate();
  const location = useLocation();
  const navigated = useRef(false);

  useEffect(() => {
    if (
      !navigated.current &&
      preferences.startupPage &&
      location.pathname === "/"
    ) {
      navigated.current = true;
      navigate(preferences.startupPage, { replace: true });
    }
  }, [preferences.startupPage, location.pathname, navigate]);

  return null;
}

function RouterContent() {
  const location = useLocation();
  const prevLocationRef = useRef(location);
  const transitionPendingRef = useRef(false);

  // Start transition on location change
  useEffect(() => {
    if (prevLocationRef.current.pathname !== location.pathname) {
      if (document.startViewTransition && !transitionPendingRef.current) {
        transitionPendingRef.current = true;
        document.startViewTransition(() => {
          prevLocationRef.current = location;
          transitionPendingRef.current = false;
        });
      } else {
        prevLocationRef.current = location;
      }
    }
  }, [location.pathname]);

  return (
    <Suspense>
      <StartupNavigator />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/accounts/:id" element={<AccountTransactions />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/payees" element={<Payees />} />
        <Route path="/scheduled" element={<ScheduledTransactions />} />
        <Route path="/reconcile/:id" element={<ReconcilePage />} />
        <Route path="/forecast/:id" element={<ForecastPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/budget" element={<BudgetPage />} />
        <Route path="/reports" element={<ReportsPage />} />
      </Routes>
    </Suspense>
  );
}

export default RouterContent;
