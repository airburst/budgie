import Header from "@/components/header";
import { PageChromeProvider } from "@/components/page-chrome";
import { useHotkeys } from "@/hooks/useHotkeys";
import { usePreferences } from "@/hooks/usePreferences";
import { GLOBAL_ROUTE_SHORTCUTS } from "@/lib/shortcuts";
import { useNavigate } from "react-router";

const Layout = ({ children }: { children: React.ReactNode }) => {
  const navigate = useNavigate();
  const { preferences } = usePreferences();

  useHotkeys([
    ...GLOBAL_ROUTE_SHORTCUTS.map((shortcut) => ({
      key: shortcut.key,
      ctrl: shortcut.ctrl,
      handler: () => navigate(shortcut.path),
    })),
    ...(preferences.accountShortcuts ?? []).map((s) => ({
      key: s.key,
      ctrl: s.ctrl,
      handler: () => navigate(`/accounts/${s.accountId}`),
    })),
  ]);

  return (
    <PageChromeProvider>
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
        <Header />
        <main className="app-main min-h-0 min-w-0 flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </PageChromeProvider>
  );
};

export default Layout;
