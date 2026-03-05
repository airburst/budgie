import Layout from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";

export default function Home() {
  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => window.api.getTasks(),
  });

  return (
    <Layout>
      <Card className="h-64">
        <CardContent className="h-64">
          <pre className="text-xs">{JSON.stringify(tasks, null, 2)}</pre>
        </CardContent>
      </Card>
    </Layout>
  );
}
