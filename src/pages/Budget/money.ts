const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

/** Signed pounds, e.g. `-£12.50`. Display only; never used for arithmetic. */
export function formatMoney(value: number): string {
  return GBP.format(value);
}
