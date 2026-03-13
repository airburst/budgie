import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BackupDialog } from "@/pages/Settings/BackupDialog";
import { RestoreDialog } from "@/pages/Settings/RestoreDialog";
import { Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router";

const navLinks = [
  { to: "/", label: "Accounts", end: true },
  { to: "/scheduled", label: "Reminders", end: false },
  { to: "/budget", label: "Budget", end: false },
  { to: "/reports", label: "Reports", end: false },
];

const Header = () => {
  const navigate = useNavigate();
  const [backupOpen, setBackupOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad|iPod/.test(navigator.userAgent));
  }, []);

  return (
    <>
      <header
        className={`bg-sidebar dark:bg-card sticky top-0 z-50 grid grid-cols-3 h-12 items-center gap-6 py-2 overflow-hidden ${
          isMac ? "pl-20 pr-4 sm:pr-6" : "px-4 sm:px-6"
        }`}
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <div />
        <nav
          className="flex items-center gap-2"
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
          className="justify-self-end"
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
            <DropdownMenuContent align="end">
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
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setBackupOpen(true)}>
                Backup...
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setRestoreOpen(true)}>
                Restore...
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <BackupDialog open={backupOpen} onOpenChange={setBackupOpen} />
      <RestoreDialog open={restoreOpen} onOpenChange={setRestoreOpen} />
    </>
  );
};

export default Header;
