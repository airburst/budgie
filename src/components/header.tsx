import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/useIsMobile";
import { usePlatform } from "@/hooks/usePlatform";
import { cn } from "@/lib/utils";
import { AboutDialog } from "@/pages/Settings/AboutDialog";
import { BackupDialog } from "@/pages/Settings/BackupDialog";
import { RestoreDialog } from "@/pages/Settings/RestoreDialog";
import { CheckIcon, MenuIcon, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router";

const navLinks = [
  { to: "/", label: "Accounts", end: true },
  { to: "/scheduled", label: "Subscriptions", end: false },
  { to: "/budget", label: "Budget", end: false },
  { to: "/reports", label: "Reports", end: false },
];

const secondaryLinks = [
  { to: "/categories", label: "Categories", end: false },
  { to: "/payees", label: "Payees", end: false },
  { to: "/settings", label: "Settings", end: false },
];

const Header = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { target, capabilities } = usePlatform();
  const isMobile = useIsMobile();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(
      target === "electron" && /Macintosh|Mac OS X/.test(navigator.userAgent),
    );
  }, [target]);

  useEffect(() => {
    setNavigationOpen(false);
  }, [location.key]);

  useEffect(() => {
    if (!isMobile) setNavigationOpen(false);
  }, [isMobile]);

  const title =
    [...navLinks, ...secondaryLinks].find(({ to, end }) =>
      end ? location.pathname === to : location.pathname.startsWith(to),
    )?.label ??
    (location.pathname.startsWith("/reconcile/")
      ? "Reconcile"
      : location.pathname.startsWith("/forecast/")
        ? "Forecast"
        : "Accounts");

  function openAction(action: () => void) {
    setNavigationOpen(false);
    action();
  }

  return (
    <>
      <header
        className={cn(
          "app-header bg-sidebar dark:bg-card z-50 flex shrink-0 items-center gap-2 md:grid md:grid-cols-[1fr_auto_1fr] md:gap-4",
          isMac && "app-header-native-mac",
        )}
        style={
          {
            WebkitAppRegion: target === "electron" ? "drag" : "no-drag",
          } as React.CSSProperties
        }
      >
        <div
          className="flex min-w-0 flex-1 items-center gap-2 md:hidden"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <Sheet open={navigationOpen} onOpenChange={setNavigationOpen}>
            <SheetTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Open navigation"
                />
              }
            >
              <MenuIcon className="size-5" />
            </SheetTrigger>
            <SheetContent
              side="left"
              className="app-navigation min-h-0 gap-0 data-[side=left]:w-[min(20rem,calc(100%-2rem))]"
            >
              <SheetHeader className="shrink-0 pr-16">
                <SheetTitle>Budgie</SheetTitle>
                <SheetDescription>Navigation</SheetDescription>
              </SheetHeader>
              <nav
                aria-label="Main navigation"
                className="min-h-0 flex-1 overflow-y-auto px-3 pb-4"
              >
                {[navLinks, secondaryLinks].map((links, index) => (
                  <div
                    key={index}
                    className={cn(
                      "space-y-1",
                      index > 0 && "mt-3 border-t pt-3",
                    )}
                  >
                    {links.map(({ to, label, end }) => (
                      <NavLink
                        key={to}
                        to={to}
                        end={end}
                        onClick={() => setNavigationOpen(false)}
                        className={({ isActive }) =>
                          cn(
                            "flex min-h-12 items-center justify-between gap-3 rounded-lg px-3 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring",
                            isActive
                              ? "bg-accent text-accent-foreground"
                              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                          )
                        }
                      >
                        {({ isActive }) => (
                          <>
                            {label}
                            {isActive && (
                              <CheckIcon
                                aria-hidden="true"
                                className="size-4"
                              />
                            )}
                          </>
                        )}
                      </NavLink>
                    ))}
                  </div>
                ))}
                <div className="mt-3 flex flex-col gap-1 border-t pt-3">
                  {capabilities.filesystemBackups && (
                    <>
                      <Button
                        variant="ghost"
                        className="justify-start"
                        onClick={() => openAction(() => setBackupOpen(true))}
                      >
                        Backup...
                      </Button>
                      <Button
                        variant="ghost"
                        className="justify-start"
                        onClick={() => openAction(() => setRestoreOpen(true))}
                      >
                        Restore...
                      </Button>
                    </>
                  )}
                  {capabilities.nativeUpdates && (
                    <Button
                      variant="ghost"
                      className="justify-start"
                      onClick={() =>
                        openAction(() => void window.api.checkForUpdates())
                      }
                    >
                      Check for updates
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    className="justify-start"
                    onClick={() => openAction(() => setAboutOpen(true))}
                  >
                    About Budgie
                  </Button>
                </div>
              </nav>
            </SheetContent>
          </Sheet>
          <span className="truncate text-lg font-semibold">{title}</span>
        </div>
        <div aria-hidden="true" className="hidden md:block" />
        <nav
          aria-label="Main navigation"
          className="hidden items-center gap-2 md:flex"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          {navLinks.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <div
          className="hidden justify-self-end md:block"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon" aria-label="Settings" />
              }
            >
              <Settings className="size-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              <DropdownMenuItem onClick={() => navigate("/settings")}>
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/categories")}>
                Categories
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/payees")}>
                Payees
              </DropdownMenuItem>
              {capabilities.filesystemBackups && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setBackupOpen(true)}>
                    Backup...
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setRestoreOpen(true)}>
                    Restore...
                  </DropdownMenuItem>
                </>
              )}
              {capabilities.nativeUpdates && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => void window.api.checkForUpdates()}
                  >
                    Check for updates
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem onClick={() => setAboutOpen(true)}>
                About Budgie
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {capabilities.filesystemBackups && (
        <>
          <BackupDialog open={backupOpen} onOpenChange={setBackupOpen} />
          <RestoreDialog open={restoreOpen} onOpenChange={setRestoreOpen} />
        </>
      )}
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
    </>
  );
};

export default Header;
