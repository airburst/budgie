export type QifTransaction = {
  date: string; // yyyy-MM-dd
  payee: string;
  amount: number;
  memo: string | null;
};

export type QifAccountType = "bank" | "credit_card";

export type QifParseResult = {
  accountType: QifAccountType;
  transactions: QifTransaction[];
};

export function parseQif(content: string): QifParseResult {
  const lines = content.trim().split(/\r?\n/);
  const header = lines[0]?.trim() ?? "";
  const isCCard = header.startsWith("!Type:CCard");
  const isBank = header.startsWith("!Type:Bank");
  if (!isBank && !isCCard) {
    throw new Error(
      "Invalid QIF file: expected !Type:Bank or !Type:CCard header",
    );
  }

  const transactions: QifTransaction[] = [];
  let date = "";
  let payee = "";
  let amount = 0;
  let memo: string | null = null;
  let hasData = false;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;

    if (line === "^") {
      if (hasData) {
        transactions.push({ date, payee, amount, memo });
      }
      date = "";
      payee = "";
      amount = 0;
      memo = null;
      hasData = false;
      continue;
    }

    const code = line[0]!;
    const value = line.slice(1);

    switch (code) {
      case "D":
        date = parseQifDate(value);
        hasData = true;
        break;
      case "P":
        payee = value;
        hasData = true;
        break;
      case "T": {
        const parsed = parseFloat(value.replace(/,/g, ""));
        amount = isCCard ? -parsed : parsed;
        hasData = true;
        break;
      }
      case "M":
        memo = value;
        break;
    }
  }

  // Handle last transaction if file doesn't end with ^
  if (hasData) {
    transactions.push({ date, payee, amount, memo });
  }

  return {
    accountType: isCCard ? "credit_card" : "bank",
    transactions: transactions.sort((a, b) => a.date.localeCompare(b.date)),
  };
}

function parseQifDate(dateStr: string): string {
  // DD/MM/YYYY format
  const parts = dateStr.split("/");
  if (parts.length !== 3) {
    throw new Error(`Invalid date format: ${dateStr}`);
  }
  const [day, month, year] = parts as [string, string, string];
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}
