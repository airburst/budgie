const setActiveAccount = (account: string) => {
  console.log(
    "%c🤪 ~ file: side-menu.tsx -> Set active account : ",
    "color: #818a88",
    account,
  );
};

const menuItems = [
  { label: "Current", key: "current" },
  { label: "Joint", key: "joint" },
  { label: "Savings", key: "savings" },
];

export default function SideMenu() {
  return (
    <nav className="bg-sidebar border-sidebar-border flex w-56 shrink-0 flex-col border-r px-2 py-4">
      <p className="text-sidebar-foreground/50 px-2 pb-1 text-xs font-medium tracking-wider uppercase">
        Accounts
      </p>
      <ul className="flex flex-col gap-0.5">
        {menuItems.map(({ label, key }) => (
          <li key={key}>
            <button
              aria-label={`${label} account`}
              onClick={() => setActiveAccount(key)}
              className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors"
            >
              {label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
