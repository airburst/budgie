import { describe, expect, it } from "vitest";
import {
  accountSummary,
  maskAccountNumber,
  remainingCredit,
} from "./account-display";

describe("account display helpers", () => {
  it("masks all but the last four characters of an account number", () => {
    expect(maskAccountNumber("12 34 5678 4821")).toBe("•• 4821");
    expect(maskAccountNumber("99")).toBe("•• 99");
    expect(maskAccountNumber("")).toBeNull();
    expect(maskAccountNumber(null)).toBeNull();
  });

  it("summarises type and masked number", () => {
    expect(accountSummary({ type: "bank", number: "40-11-22 12344821" })).toBe(
      "Bank · •• 4821",
    );
    expect(accountSummary({ type: "credit_card", number: null })).toBe(
      "Credit card",
    );
  });

  it("only reports remaining credit for credit cards with a limit", () => {
    expect(
      remainingCredit({
        type: "credit_card",
        creditLimit: 5000,
        computedBalance: -1250,
      }),
    ).toBe(3750);
    expect(
      remainingCredit({
        type: "credit_card",
        creditLimit: null,
        computedBalance: -1250,
      }),
    ).toBeNull();
    expect(
      remainingCredit({ type: "loan", creditLimit: 5000, computedBalance: -1 }),
    ).toBeNull();
  });
});
