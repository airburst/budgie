type Filter = "all" | "income" | "expenses";

type TransactionFiltersProps = {
  value: Filter;
  onChange: (v: Filter) => void;
};

export function TransactionFilters({
  value,
  onChange,
}: TransactionFiltersProps) {
  return (
    <div className="flex items-center bg-muted p-1 rounded-lg gap-1">
      {(["all", "income", "expenses"] as Filter[]).map((f) => (
        <button
          key={f}
          onClick={() => onChange(f)}
          className={`px-3 py-1 text-xs font-semibold rounded-md capitalize transition-colors ${
            value === f
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {f}
        </button>
      ))}
    </div>
  );
}
