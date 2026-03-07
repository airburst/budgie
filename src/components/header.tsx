import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChartNoAxesCombinedIcon, Settings } from "lucide-react";
import { Link, NavLink, useNavigate } from "react-router";

const navLinks = [
  { to: "/", label: "Accounts", end: true },
  { to: "/scheduled", label: "Reminders", end: false },
];

const Header = () => {
  const navigate = useNavigate();

  return (
    <header className="bg-card sticky top-0 z-50 flex h-16 justify-between items-center gap-6 border-b px-4 py-2 sm:px-6 overflow-hidden">
      <Link
        to="/"
        className="text-foreground text-base font-semibold tracking-tight shrink-0"
      >
        <ChartNoAxesCombinedIcon className="inline-block mr-2" />
        Budgie
      </Link>

      <nav className="flex items-center gap-2">
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

      <div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon" aria-label="Settings" />
            }
          >
            <Settings className="size-5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => navigate("/categories")}>
              Categories
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

export default Header;
