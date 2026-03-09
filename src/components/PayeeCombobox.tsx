import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { usePayees } from "@/hooks/usePayees";
import type { Payee } from "@/types/electron";
import { useRef } from "react";

type PayeeComboboxProps = {
  value: string;
  onValueChange: (name: string) => void;
  onPayeeSelect: (payee: Payee) => void;
  autoFocus?: boolean;
};

export function PayeeCombobox({
  value,
  onValueChange,
  onPayeeSelect,
  autoFocus,
}: PayeeComboboxProps) {
  const { payees } = usePayees();
  // Track whether the input is focused so we can ignore Base UI's blur-reset
  // (which internally fires onInputValueChange("") when no item is selected)
  const focusedRef = useRef(false);

  const selected = payees.find((p) => p.name === value) ?? null;

  function firstMatch(): Payee | null {
    if (!value) return null;
    const lower = value.toLowerCase();
    return payees.find((p) => p.name.toLowerCase().startsWith(lower)) ?? null;
  }

  // Clicking an item in the dropdown
  function handleValueChange(payee: Payee | null) {
    if (payee) {
      onValueChange(payee.name);
      onPayeeSelect(payee);
    } else {
      // Clear button was pressed
      onValueChange("");
    }
  }

  // Only propagate input changes while the field is focused.
  // When the user blurs and no item is selected, Base UI resets by calling
  // onInputValueChange("") — we suppress that so typed free-text is preserved.
  function handleInputChange(text: string) {
    if (focusedRef.current) {
      onValueChange(text);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Tab" && e.key !== "Enter") return;
    const match = firstMatch();
    if (!match) return;
    // Tab: complete and let focus move naturally to the next field
    // Enter: complete and prevent form submission
    if (e.key === "Enter") e.preventDefault();
    onValueChange(match.name);
    onPayeeSelect(match);
  }

  return (
    <Combobox
      items={payees}
      value={selected}
      inputValue={value}
      itemToStringLabel={(p: Payee) => p.name}
      onValueChange={(p) => handleValueChange(p as Payee | null)}
      onInputValueChange={handleInputChange}
    >
      <ComboboxInput
        placeholder="e.g. Starbucks, Amazon..."
        showClear
        autoFocus={autoFocus}
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
          {(payee: Payee) => (
            <ComboboxItem key={payee.id} value={payee}>
              {payee.name}
            </ComboboxItem>
          )}
        </ComboboxList>
        <ComboboxEmpty>No saved payees match</ComboboxEmpty>
      </ComboboxContent>
    </Combobox>
  );
}
