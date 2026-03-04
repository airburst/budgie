import SideMenu from "@/components/side-menu";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

const Layout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="flex min-h-dvh w-full">
      <SidebarProvider>
        <SideMenu />

        <div className="flex flex-1 flex-col">
          <header className="bg-card sticky top-0 z-50 flex h-13.75 items-center justify-between gap-6 border-b px-4 py-2 sm:px-6">
            <SidebarTrigger className="[&_svg]:size-5!" />
          </header>

          <main className="size-full flex-1 px-4 py-6 sm:px-6">{children}</main>
        </div>
      </SidebarProvider>
    </div>
  );
};

export default Layout;
