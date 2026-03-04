import Layout from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";

export default function Home() {
  return (
    <Layout>
      <Card className="h-64">
        <CardContent className="h-64">
          <div className="border-card-foreground/10 h-64" />
        </CardContent>
      </Card>
    </Layout>
  );
}
