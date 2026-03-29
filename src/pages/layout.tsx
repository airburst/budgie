import Header from "@/components/header";
import { useHotkeys } from "@/hooks/useHotkeys";
import { usePreferences } from "@/hooks/usePreferences";
import { useNavigate } from "react-router";

const Layout = ({ children }: { children: React.ReactNode }) => {
  const navigate = useNavigate();
  const { preferences } = usePreferences();

  useHotkeys([
    { key: "a", handler: () => navigate("/") },
    { key: "s", handler: () => navigate("/scheduled") },
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
