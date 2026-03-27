import Header from "@/components/header";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useNavigate } from "react-router";

const Layout = ({ children }: { children: React.ReactNode }) => {
  const navigate = useNavigate();

  useHotkeys([
    { key: "a", handler: () => navigate("/") },
    { key: "s", handler: () => navigate("/scheduled") },
  ]);

  return (
    <div className="flex h-full w-full flex-col">
      <Header />
      <main className="h-full flex-1 overflow-y-auto">{children}</main>
    </div>
  );
};

export default Layout;
