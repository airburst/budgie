import Header from "@/components/header";
import SideMenu from "@/components/side-menu";
import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";

export default function Home() {
  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => window.api.getTasks(),
  });

  return (
    <div className="flex h-dvh flex-col">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <SideMenu />
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          <Card className="h-64">
            <CardContent className="h-64">
              <pre className="text-xs">{JSON.stringify(tasks, null, 2)}</pre>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}
