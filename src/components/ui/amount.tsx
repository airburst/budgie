type AmountProps = {
  value: number;
};

export function Amount({ value }: AmountProps) {
  const color = value >= 0 ? "text-green-600" : "text-red-600";
  const formatted = value.toLocaleString("en-GB", {
    style: "currency",
    currency: "GBP",
  });

  return <span className={color}>{formatted}</span>;
}
