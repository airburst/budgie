import SideMenu from "@/components/side-menu";
import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import Layout from "./layout";

export default function Home() {
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => window.api.getAccounts(),
  });

  return (
    <Layout>
      <div className="flex flex-row">
        <SideMenu />
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          <Card className="h-64">
            <CardContent className="h-64">
              <pre className="text-xs">{JSON.stringify(accounts, null, 2)}</pre>
            </CardContent>
          </Card>
        </main>
      </div>
    </Layout>
  );
}
