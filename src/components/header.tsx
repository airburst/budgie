import { ChartNoAxesCombinedIcon } from "lucide-react";
import { Link, NavLink } from "react-router";

const navLinks = [
  { to: "/", label: "Accounts", end: true },
  { to: "/scheduled", label: "Scheduled Payments", end: false },
  { to: "/categories", label: "Categories", end: false },
];

const Header = () => {
  return (
    <header className="bg-card sticky top-0 z-50 flex h-16 items-center gap-6 border-b px-4 py-2 sm:px-6 overflow-hidden">
      <Link
        to="/"
        className="text-foreground text-base font-semibold tracking-tight shrink-0"
      >
        <ChartNoAxesCombinedIcon className="inline-block mr-2" />
        Budgie
      </Link>
      <nav className="flex items-center gap-1">
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
    </header>
  );
};

export default Header;
