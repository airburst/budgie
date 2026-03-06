import Header from "@/components/header";

const Layout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="flex h-full w-full flex-col">
      <Header />
      <main className="size-full flex-1 overflow-y-auto">{children}</main>
    </div>
  );
};

export default Layout;
