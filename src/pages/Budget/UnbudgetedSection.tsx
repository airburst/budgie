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
    <div className="bg-card rounded-lg border border-dashed p-3 md:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="font-medium text-muted-foreground">
            Unbudgeted Spending
          </span>
          <p className="text-muted-foreground text-xs break-words">
            {categories.map((c) => c.name).join(" · ")}
          </p>
        </div>
        <span className="text-destructive text-sm font-medium tabular-nums">
          £{Math.abs(total).toFixed(2)}
        </span>
      </div>
    </div>
  );
}
