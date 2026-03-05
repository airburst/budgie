import Layout from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import type { Task } from "@/types/electron.d";
import { useEffect, useState } from "react";

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    window.api.getTasks().then(setTasks);
  }, []);

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
