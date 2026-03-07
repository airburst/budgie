import AccountsMenu from "@/components/AccountsMenu/accounts-menu";
import { useAccounts } from "@/hooks/useAccounts";
import Layout from "../layout";
import { AccountsTable } from "./AccountsTable";

export default function Home() {
  const { accounts } = useAccounts();

  return (
    <Layout>
      <div className="flex flex-row h-full">
        <AccountsMenu />
        <div className="flex flex-col flex-1 p-4">
          <AccountsTable accounts={accounts} />
        </div>
      </div>
    </Layout>
  );
}
