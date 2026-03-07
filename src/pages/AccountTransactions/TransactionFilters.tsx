import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";

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
    <ButtonGroup>
      {(["all", "income", "expenses"] as Filter[]).map((f) => (
        <Button
          key={f}
          variant={value === f ? "default" : "outline"}
          size="sm"
          onClick={() => onChange(f)}
          className="capitalize"
        >
          {f}
        </Button>
      ))}
    </ButtonGroup>
  );
}
