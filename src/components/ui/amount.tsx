import { memo } from "react";

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

type AmountProps = {
  value: number;
};

export const Amount = memo(function Amount({ value }: AmountProps) {
  const color = value >= 0 ? "text-green-600" : "text-red-600";
  return <span className={color}>{GBP.format(value)}</span>;
});
