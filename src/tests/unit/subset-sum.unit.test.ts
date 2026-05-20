import { findSubsetSum } from "@/lib/subset-sum";
import { describe, expect, it } from "vitest";

function sumAtIndices(amounts: number[], indices: number[]): number {
  return indices.reduce((s, i) => s + amounts[i]!, 0);
}

describe("findSubsetSum", () => {
  it("returns not found when target is 0", () => {
    const result = findSubsetSum([10, 20, 30], 0);
    expect(result.found).toBe(false);
  });

  it("returns not found for empty amounts", () => {
    const result = findSubsetSum([], 50);
    expect(result.found).toBe(false);
  });

  it("returns not found when amounts exceed cap (31 items)", () => {
    const amounts = Array.from({ length: 31 }, (_, i) => i + 1);
    const result = findSubsetSum(amounts, 1);
    expect(result.found).toBe(false);
  });

  it("attempts search at the cap (30 items)", () => {
    const amounts = Array.from({ length: 30 }, () => 10);
    const result = findSubsetSum(amounts, 10);
    expect(result.found).toBe(true);
    if (result.found) {
      expect(Math.abs(sumAtIndices(amounts, result.indices) - 10)).toBeLessThan(
        0.005,
      );
    }
  });

  it("finds single-item exact match", () => {
    const result = findSubsetSum([10, 50, 30], 50);
    expect(result.found).toBe(true);
    if (result.found) {
      expect(Math.abs(sumAtIndices([10, 50, 30], result.indices) - 50)).toBeLessThan(0.005);
    }
  });

  it("finds multi-item match", () => {
    const result = findSubsetSum([10, 20, 30], 30);
    expect(result.found).toBe(true);
    if (result.found) {
      expect(Math.abs(sumAtIndices([10, 20, 30], result.indices) - 30)).toBeLessThan(0.005);
    }
  });

  it("handles mixed positive and negative amounts", () => {
    // 100 + (-30) + (-20) = 50
    const amounts = [100, -30, -20];
    const result = findSubsetSum(amounts, 50);
    expect(result.found).toBe(true);
    if (result.found) {
      expect(Math.abs(sumAtIndices(amounts, result.indices) - 50)).toBeLessThan(0.005);
    }
  });

  it("returns not found when no solution exists", () => {
    const result = findSubsetSum([1, 2, 3], 100);
    expect(result.found).toBe(false);
  });

  it("handles float precision trap (1.10 + 2.20 = 3.30)", () => {
    const result = findSubsetSum([1.1, 2.2], 3.3);
    expect(result.found).toBe(true);
    if (result.found) {
      expect(Math.abs(sumAtIndices([1.1, 2.2], result.indices) - 3.3)).toBeLessThan(0.005);
    }
  });

  it("finds subset with negative target", () => {
    const amounts = [-50, -30];
    const result = findSubsetSum(amounts, -50);
    expect(result.found).toBe(true);
    if (result.found) {
      expect(Math.abs(sumAtIndices(amounts, result.indices) - (-50))).toBeLessThan(0.005);
    }
  });

  it("returned indices map to the correct amounts sum", () => {
    const amounts = [15.5, 22.75, 7.25, 100, 50];
    const target = 38.0; // 15.5 + 22.75 - 0.25... actually 15.5 + 22.75 = 38.25, try 7.25+30.75 — let's use 15.5 + 22.5
    // Use a target we know has a solution
    const t = 15.5 + 7.25; // 22.75
    const r = findSubsetSum(amounts, t);
    expect(r.found).toBe(true);
    if (r.found) {
      const sum = sumAtIndices(amounts, r.indices);
      expect(Math.abs(sum - t)).toBeLessThan(0.005);
    }
  });
});
