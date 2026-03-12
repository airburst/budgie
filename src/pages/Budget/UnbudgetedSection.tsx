type UnbudgetedCategory = {
  categoryId: number;
  name: string;
  amount: number;
};

type Props = {
  total: number;
  categories: UnbudgetedCategory[];
};

export function UnbudgetedSection({ total, categories }: Props) {
  if (categories.length === 0) return null;

  return (
    <div className="bg-card rounded-lg border border-dashed p-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="font-medium text-muted-foreground">
            Unbudgeted Spending
          </span>
          <p className="text-muted-foreground text-xs">
            {categories.map((c) => c.name).join(" · ")}
          </p>
        </div>
        <span className="text-destructive text-sm font-medium">
          £{Math.abs(total).toFixed(2)}
        </span>
      </div>
    </div>
  );
}
