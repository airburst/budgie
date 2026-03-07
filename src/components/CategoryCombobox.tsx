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
import { useState } from "react";

type CategoryComboboxProps = {
  value: string;
  onValueChange: (value: string) => void;
};

export function CategoryCombobox({ value, onValueChange }: CategoryComboboxProps) {
  const { categories, create } = useCategories();
  const [inputValue, setInputValue] = useState("");

  const selected = value
    ? (categories.find((c) => String(c.id) === value) ?? null)
    : null;

  async function handleCreate() {
    const name = inputValue.trim();
    if (!name) return;
    const [newCat] = await create.mutateAsync({ name, color: null, icon: null });
    if (newCat) {
      onValueChange(String(newCat.id));
    }
  }

  return (
    <Combobox
      items={categories}
      value={selected}
      itemToStringLabel={(cat: Category) => cat.name}
      onValueChange={(cat) =>
        onValueChange(cat ? String((cat as Category).id) : "")
      }
      onInputValueChange={setInputValue}
    >
      <ComboboxInput placeholder="No category" showClear />
      <ComboboxContent>
        <ComboboxList>
          {(cat: Category) => (
            <ComboboxItem key={cat.id} value={cat}>
              {cat.name}
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
