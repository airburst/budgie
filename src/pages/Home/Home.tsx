import AccountsMenu from "@/components/AccountsMenu/accounts-menu";
import { useAccounts } from "@/hooks/useAccounts";
import Layout from "../layout";
import { AccountsList } from "./AccountsList";

export default function Home() {
  const { accounts, isLoading, isError, refetch } = useAccounts();

  return (
    <Layout>
      <div className="flex h-full min-h-0 flex-row">
        <AccountsMenu />
        <div className="flex min-w-0 flex-1 flex-col p-4 md:p-6">
          <AccountsList
            accounts={accounts}
            isLoading={isLoading}
            isError={isError}
            onRetry={() => void refetch()}
          />
        </div>
      </div>
    </Layout>
  );
}
