import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router";
import AccountButton from "./account-button";

export default function AccountsMenu() {
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => window.api.getAccounts(),
  });

  const { id } = useParams<{ id?: string }>();
  const activeAccountId = id ? Number(id) : null;
  const navigate = useNavigate();

  return (
    <nav className="bg-sidebar border-sidebar-border flex w-56 shrink-0 flex-col border-r px-2 py-4">
      <p className="text-sidebar-foreground/50 px-2 pb-1 text-xs font-medium tracking-wider uppercase">
        Accounts
      </p>
      <ul className="flex flex-col gap-0.5">
        {accounts.map(({ id, name, balance }) => (
          <li key={id}>
            <AccountButton
              name={name}
              balance={balance}
              isActive={activeAccountId === id}
              onClick={() => navigate(`/accounts/${id}`)}
            />
          </li>
        ))}
      </ul>
    </nav>
  );
}
