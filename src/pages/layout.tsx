import Header from "@/components/header";
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
    <div className="flex h-full w-full flex-col">
      <Header />
      <main className="h-full flex-1 overflow-y-auto">{children}</main>
    </div>
  );
};

export default Layout;
