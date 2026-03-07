import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ScheduledTransaction } from "@/types/electron";
import { ScheduledSummaryCard } from "./ScheduledSummaryCard";

function makeTx(
  overrides: Partial<ScheduledTransaction> = {},
): ScheduledTransaction {
  return {
    id: 1,
    accountId: 1,
    categoryId: null,
    payee: "Test",
    amount: -100,
    rrule: "FREQ=MONTHLY",
    nextDueDate: null,
    autoPost: false,
    notes: null,
    active: true,
    createdAt: "2024-01-01",
    ...overrides,
  };
}

function isoDateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

describe("ScheduledSummaryCard", () => {
  describe("total amount", () => {
    it("shows £0.00 for an empty list", () => {
      render(<ScheduledSummaryCard scheduledTransactions={[]} />);
      expect(screen.getByText("£0.00")).toBeTruthy();
    });

    it("sums expense amounts (negative) correctly", () => {
      render(
        <ScheduledSummaryCard
          scheduledTransactions={[
            makeTx({ id: 1, amount: -200 }),
            makeTx({ id: 2, amount: -300 }),
          ]}
        />,
      );
      expect(screen.getByText("-£500.00")).toBeTruthy();
    });

    it("sums income amounts (positive) correctly", () => {
      render(
        <ScheduledSummaryCard
          scheduledTransactions={[
            makeTx({ id: 1, amount: 1000 }),
            makeTx({ id: 2, amount: 500 }),
          ]}
        />,
      );
      expect(screen.getByText("£1,500.00")).toBeTruthy();
    });

    it("nets income and expenses correctly", () => {
      render(
        <ScheduledSummaryCard
          scheduledTransactions={[
            makeTx({ id: 1, amount: 2000 }),
            makeTx({ id: 2, amount: -800 }),
          ]}
        />,
      );
      expect(screen.getByText("£1,200.00")).toBeTruthy();
    });

    it("excludes inactive transactions from the total", () => {
      render(
        <ScheduledSummaryCard
          scheduledTransactions={[
            makeTx({ id: 1, amount: -500 }),
            makeTx({ id: 2, amount: -300, active: false }),
          ]}
        />,
      );
      expect(screen.getByText("-£500.00")).toBeTruthy();
    });

    it("shows £0.00 when all transactions are inactive", () => {
      render(
        <ScheduledSummaryCard
          scheduledTransactions={[makeTx({ active: false })]}
        />,
      );
      expect(screen.getByText("£0.00")).toBeTruthy();
    });
  });

  describe("due-soon count", () => {
    it("counts active transactions due within 7 days", () => {
      render(
        <ScheduledSummaryCard
          scheduledTransactions={[
            makeTx({ id: 1, nextDueDate: isoDateOffset(2) }),
            makeTx({ id: 2, nextDueDate: isoDateOffset(5) }),
            makeTx({ id: 3, nextDueDate: isoDateOffset(30) }),
          ]}
        />,
      );
      expect(screen.getByText("2")).toBeTruthy();
    });

    it("does not count transactions due beyond 7 days", () => {
      render(
        <ScheduledSummaryCard
          scheduledTransactions={[
            makeTx({ id: 1, nextDueDate: isoDateOffset(10) }),
          ]}
        />,
      );
      expect(screen.getByText("0")).toBeTruthy();
    });

    it("does not count overdue (past) transactions as due soon", () => {
      render(
        <ScheduledSummaryCard
          scheduledTransactions={[
            makeTx({ id: 1, nextDueDate: isoDateOffset(-3) }),
          ]}
        />,
      );
      expect(screen.getByText("0")).toBeTruthy();
    });

    it("does not count inactive transactions as due soon", () => {
      render(
        <ScheduledSummaryCard
          scheduledTransactions={[
            makeTx({ id: 1, nextDueDate: isoDateOffset(2), active: false }),
          ]}
        />,
      );
      expect(screen.getByText("0")).toBeTruthy();
    });

    it("ignores transactions with no nextDueDate", () => {
      render(
        <ScheduledSummaryCard
          scheduledTransactions={[makeTx({ nextDueDate: null })]}
        />,
      );
      expect(screen.getByText("0")).toBeTruthy();
    });
  });
});
