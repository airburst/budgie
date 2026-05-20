export type SubsetSumResult =
  | { found: true; indices: number[] }
  | { found: false };

const MAX_ITEMS = 30;
const BUDGET = 500_000;

export function findSubsetSum(
  amounts: number[],
  target: number,
): SubsetSumResult {
  if (target === 0 || amounts.length === 0 || amounts.length > MAX_ITEMS) {
    return { found: false };
  }

  const n = amounts.length;
  const targetCents = Math.round(target * 100);
  const centAmounts = amounts.map((a) => Math.round(a * 100));

  // Suffix min/max for pruning: min/max achievable sum from index i onward
  const minRemaining = new Array<number>(n + 1).fill(0);
  const maxRemaining = new Array<number>(n + 1).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    minRemaining[i] = minRemaining[i + 1]! + Math.min(0, centAmounts[i]!);
    maxRemaining[i] = maxRemaining[i + 1]! + Math.max(0, centAmounts[i]!);
  }

  let iters = 0;
  const chosen: number[] = [];

  function backtrack(i: number, remaining: number): boolean {
    if (remaining === 0) return true;
    if (++iters > BUDGET || i === n) return false;
    if (remaining > maxRemaining[i]! || remaining < minRemaining[i]!) {
      return false;
    }

    chosen.push(i);
    if (backtrack(i + 1, remaining - centAmounts[i]!)) return true;
    chosen.pop();

    return backtrack(i + 1, remaining);
  }

  if (backtrack(0, targetCents)) {
    return { found: true, indices: [...chosen] };
  }
  return { found: false };
}
