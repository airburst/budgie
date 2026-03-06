import { useQuery } from "@tanstack/react-query";
import AccountButton from "./account-button";

const setActiveAccount = (account: string) => {
  console.log(
    "%c🤪 ~ file: accounts-menu.tsx -> Set active account : ",
    "color: #818a88",
    account,
  );
};

export default function AccountsMenu() {
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => window.api.getAccounts(),
  });

  return (
    <nav className="bg-sidebar border-sidebar-border flex w-56 shrink-0 flex-col border-r px-2 py-4">
      <p className="text-sidebar-foreground/50 px-2 pb-1 text-xs font-medium tracking-wider uppercase">
        Accounts
      </p>
      <ul className="flex flex-col gap-0.5">
        {accounts.map(({ name, balance }) => (
          <li key={name}>
            <AccountButton
              name={name}
              balance={balance}
              activeAccount="Joint"
              onClick={() => setActiveAccount(name)}
            />
          </li>
        ))}
      </ul>
    </nav>
  );
}
