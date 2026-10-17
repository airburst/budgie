import type { ScheduledTransaction } from "@/types/electron";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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

function income() {
  return screen.getByText("Income").nextElementSibling as HTMLElement;
}

function outgoing() {
  return screen.getByText("Outgoing").nextElementSibling as HTMLElement;
}

describe("ScheduledSummaryCard", () => {
  describe("income and outgoing totals", () => {
    it("shows zero explicitly on both sides for an empty list", () => {
      render(<ScheduledSummaryCard scheduledTransactions={[]} />);
      expect(within(income()).getByText("£0.00")).toBeTruthy();
      expect(within(outgoing()).getByText("£0.00")).toBeTruthy();
    });

    it("sums expenses as an absolute Outgoing total and zero Income", () => {
      render(
        <ScheduledSummaryCard
          scheduledTransactions={[
            makeTx({ id: 1, amount: -200, nextDueDate: isoDateOffset(1) }),
            makeTx({ id: 2, amount: -300, nextDueDate: isoDateOffset(3) }),
          ]}
        />,
      );
      expect(within(outgoing()).getByText("£500.00")).toBeTruthy();
      expect(within(income()).getByText("£0.00")).toBeTruthy();
    });

    it("sums income as Income and zero Outgoing", () => {
      render(
        <ScheduledSummaryCard
          scheduledTransactions={[
            makeTx({ id: 1, amount: 1000, nextDueDate: isoDateOffset(1) }),
            makeTx({ id: 2, amount: 500, nextDueDate: isoDateOffset(3) }),
          ]}
        />,
      );
      expect(within(income()).getByText("£1,500.00")).toBeTruthy();
      expect(within(outgoing()).getByText("£0.00")).toBeTruthy();
    });

    it("never nets income against outgoing", () => {
      render(
        <ScheduledSummaryCard
          scheduledTransactions={[
            makeTx({ id: 1, amount: 2000, nextDueDate: isoDateOffset(1) }),
            makeTx({ id: 2, amount: -800, nextDueDate: isoDateOffset(3) }),
          ]}
        />,
      );
      expect(within(income()).getByText("£2,000.00")).toBeTruthy();
      expect(within(outgoing()).getByText("£800.00")).toBeTruthy();
      expect(screen.queryByText("£1,200.00")).toBeNull();
    });

    it("excludes paused schedules from both totals", () => {
      render(
        <ScheduledSummaryCard
          scheduledTransactions={[
            makeTx({ id: 1, amount: -500, nextDueDate: isoDateOffset(1) }),
            makeTx({
              id: 2,
              amount: -300,
              active: false,
              nextDueDate: isoDateOffset(1),
            }),
            makeTx({
              id: 3,
              amount: 900,
              active: false,
              nextDueDate: isoDateOffset(1),
            }),
          ]}
        />,
      );
      expect(within(outgoing()).getByText("£500.00")).toBeTruthy();
      expect(within(income()).getByText("£0.00")).toBeTruthy();
    });

    it("shows zero on both sides when everything is paused", () => {
      render(
        <ScheduledSummaryCard
          scheduledTransactions={[makeTx({ active: false })]}
        />,
      );
      expect(within(income()).getByText("£0.00")).toBeTruthy();
      expect(within(outgoing()).getByText("£0.00")).toBeTruthy();
    });
  });

  describe("scope label", () => {
    it("defaults to All accounts", () => {
      render(<ScheduledSummaryCard scheduledTransactions={[]} />);
      expect(screen.getByText("All accounts")).toBeTruthy();
    });

    it("shows the supplied account scope", () => {
      render(
        <ScheduledSummaryCard
          scheduledTransactions={[]}
          scopeLabel="2 accounts"
        />,
      );
      expect(screen.getByText("2 accounts")).toBeTruthy();
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
