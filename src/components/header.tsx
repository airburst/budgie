import { ChartNoAxesCombinedIcon } from "lucide-react";
import { Link } from "react-router";

const Header = () => {
  return (
    <header className="bg-card sticky top-0 z-50 flex h-16 items-center border-b px-4 py-2 sm:px-6 overflow-hidden">
      <Link
        to="/"
        className="text-foreground text-base font-semibold tracking-tight"
      >
        <ChartNoAxesCombinedIcon className="inline-block mr-2" />
        Budgie
      </Link>
    </header>
  );
};

export default Header;
