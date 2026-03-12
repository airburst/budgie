import { describe, expect, it } from "vitest";
import { parseQif } from "@/lib/qif-parser";

describe("parseQif", () => {
  it("parses a basic QIF file", () => {
    const content = `!Type:Bank
D09/03/2026
PSAINSBURYS S/MKTS
T-156.46
^
D09/03/2026
PT FAIRHURST
T580
^`;
    const result = parseQif(content);
    expect(result.accountType).toBe("bank");
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]).toEqual({
      date: "2026-03-09",
      payee: "SAINSBURYS S/MKTS",
      amount: -156.46,
      memo: null,
    });
    expect(result.transactions[1]).toEqual({
      date: "2026-03-09",
      payee: "T FAIRHURST",
      amount: 580,
      memo: null,
    });
  });

  it("parses memo field", () => {
    const content = `!Type:Bank
D01/02/2026
PPAYEE
T-10.00
MSome memo text
^`;
    const result = parseQif(content);
    expect(result.transactions[0]!.memo).toBe("Some memo text");
  });

  it("sorts by date ascending", () => {
    const content = `!Type:Bank
D09/03/2026
PLATER
T-10
^
D05/03/2026
PEARLIER
T-20
^`;
    const result = parseQif(content);
    expect(result.transactions[0]!.date).toBe("2026-03-05");
    expect(result.transactions[1]!.date).toBe("2026-03-09");
  });

  it("parses CCard type with negated amounts", () => {
    const content = `!Type:CCard
D08/03/2026
PSHOP CHARGE
T36
^
D08/03/2026
PPAYMENT RECEIVED
T-164
^`;
    const result = parseQif(content);
    expect(result.accountType).toBe("credit_card");
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]!.amount).toBe(-36);
    expect(result.transactions[1]!.amount).toBe(164);
  });

  it("throws on unsupported type", () => {
    expect(() => parseQif("!Type:Invst\nD01/01/2026\nPFoo\nT-5\n^")).toThrow(
      "expected !Type:Bank or !Type:CCard header",
    );
  });

  it("throws on empty content", () => {
    expect(() => parseQif("")).toThrow("Invalid QIF file");
  });

  it("handles amounts without decimals", () => {
    const content = `!Type:Bank
D01/01/2026
PPAYEE
T500
^`;
    const result = parseQif(content);
    expect(result.transactions[0]!.amount).toBe(500);
  });

  it("handles amounts with commas", () => {
    const content = `!Type:Bank
D01/01/2026
PPAYEE
T-1,234.56
^`;
    const result = parseQif(content);
    expect(result.transactions[0]!.amount).toBe(-1234.56);
  });

  it("handles file without trailing ^", () => {
    const content = `!Type:Bank
D01/01/2026
PPAYEE
T-5`;
    const result = parseQif(content);
    expect(result.transactions).toHaveLength(1);
  });

  it("handles Windows line endings", () => {
    const content = "!Type:Bank\r\nD01/01/2026\r\nPPAYEE\r\nT-5\r\n^\r\n";
    const result = parseQif(content);
    expect(result.transactions).toHaveLength(1);
  });

  it("skips empty blocks", () => {
    const content = `!Type:Bank
^
D01/01/2026
PPAYEE
T-5
^`;
    const result = parseQif(content);
    expect(result.transactions).toHaveLength(1);
  });

  it("pads single-digit days and months", () => {
    const content = `!Type:Bank
D1/3/2026
PPAYEE
T-5
^`;
    const result = parseQif(content);
    expect(result.transactions[0]!.date).toBe("2026-03-01");
  });
});
