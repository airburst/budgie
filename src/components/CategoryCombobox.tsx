import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { useCategories } from "@/hooks/useCategories";
import type { Category } from "@/types/electron";
import { PlusIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";

type CategoryComboboxProps = {
  value: string;
  onValueChange: (value: string) => void;
};

export function CategoryCombobox({
  value,
  onValueChange,
}: CategoryComboboxProps) {
  const { categories, create } = useCategories();
  const [inputValue, setInputValue] = useState("");
  const focusedRef = useRef(false);

  const selected = value
    ? (categories.find((c) => String(c.id) === value) ?? null)
    : null;

  const { sorted, labelMap } = useMemo(() => {
    const parentMap = new Map(categories.map((c) => [c.id, c.name]));
    const labelMap = new Map(
      categories.map((c) => [
        c.id,
        c.parentId != null
          ? `${parentMap.get(c.parentId) ?? ""} > ${c.name}`
          : c.name,
      ]),
    );
    const sorted = [...categories].sort((a, b) =>
      (labelMap.get(a.id) ?? "").localeCompare(labelMap.get(b.id) ?? ""),
    );
    return { sorted, labelMap };
  }, [categories]);

  function label(cat: Category) {
    return labelMap.get(cat.id) ?? cat.name;
  }

  async function handleCreate() {
    const name = inputValue.trim();
    if (!name) return;
    const [newCat] = await create.mutateAsync({
      name,
      expenseType: "expense",
      parentId: null,
    });
    if (newCat) {
      onValueChange(String(newCat.id));
    }
  }

  function firstMatch(): Category | null {
    if (!inputValue) return null;
    const lower = inputValue.toLowerCase();
    return sorted.find((c) => label(c).toLowerCase().includes(lower)) ?? null;
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Tab" && e.key !== "Enter") return;
    const match = firstMatch();
    if (match) {
      if (e.key === "Enter") e.preventDefault();
      onValueChange(String(match.id));
      return;
    }
    // No match: create the typed category
    if (inputValue.trim()) {
      if (e.key === "Enter") e.preventDefault();
      handleCreate();
    }
  }

  return (
    <Combobox
      items={sorted}
      value={selected}
      itemToStringLabel={(cat: Category) => label(cat)}
      onValueChange={(cat) =>
        onValueChange(cat ? String((cat as Category).id) : "")
      }
      onInputValueChange={(val) => {
        if (focusedRef.current) setInputValue(val);
      }}
    >
      <ComboboxInput
        placeholder="No category"
        showClear
        onFocus={() => {
          focusedRef.current = true;
        }}
        onBlur={() => {
          focusedRef.current = false;
        }}
        onKeyDown={handleKeyDown}
      />
      <ComboboxContent>
        <ComboboxList>
          {(cat: Category) => (
            <ComboboxItem key={cat.id} value={cat}>
              {label(cat)}
            </ComboboxItem>
          )}
        </ComboboxList>
        <ComboboxEmpty>
          {inputValue.trim() ? (
            <button
              type="button"
              onClick={handleCreate}
              disabled={create.isPending}
              className="flex w-full cursor-pointer items-center gap-2 rounded-md py-1 pr-8 pl-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              <PlusIcon className="size-4 shrink-0" />
              Create "{inputValue}"
            </button>
          ) : (
            <span className="py-2 text-xs text-muted-foreground">
              Type to search or create
            </span>
          )}
        </ComboboxEmpty>
      </ComboboxContent>
    </Combobox>
  );
}
