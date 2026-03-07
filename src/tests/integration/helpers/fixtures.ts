// ─── Account fixtures ─────────────────────────────────────────────────────────

export const ACCOUNT_A = {
  name: "Current Account",
  type: "bank" as const,
  balance: 1000,
};

export const ACCOUNT_B = {
  name: "Savings Account",
  type: "bank" as const,
  balance: 5000,
};

// ─── Expected balances after inserting fixture transactions ───────────────────
//
// Account A cleared transactions:
//   +2500.00  Salary Jan        (cleared)
//   -  250.00  Groceries         (cleared)
//   +2500.00  Salary Feb        (cleared)
//   -  500.00  Rent              (cleared)
//   -  547.80  Utilities         (cleared)
//   ─────────
//   +3702.20  sum of cleared
//
// Account A uncleared transactions:
//   -   78.00  Pending Purchase  (uncleared)
//   -   12.50  Coffee            (uncleared)
//   ─────────
//   -   90.50  sum of uncleared
//
// computedBalance = 1000 + 3702.20 − 90.50 = 4611.70
// clearedBalance  = 1000 + 3702.20          = 4702.20
//
// Account B:
//   +2000.00  Transfer In   (cleared)
//   -  500.00  Withdrawal    (cleared)
//   +   12.50  Interest      (cleared)
//   ─────────
//   +1512.50  sum of cleared
//
// computedBalance = clearedBalance = 5000 + 1512.50 = 6512.50

export const EXPECTED = {
  ACCOUNT_A_COMPUTED: 4611.7,
  ACCOUNT_A_CLEARED: 4702.2,
  ACCOUNT_B_COMPUTED: 6512.5,
  ACCOUNT_B_CLEARED: 6512.5,
} as const;

// ─── Transaction fixtures ──────────────────────────────────────────────────────
// accountId is omitted here; test code adds it when inserting.

type TxBase = {
  date: string;
  payee: string;
  amount: number;
  cleared: boolean;
  notes: string | null;
};

export const TRANSACTIONS_A: TxBase[] = [
  {
    date: "2026-01-10",
    payee: "Salary Jan",
    amount: 2500,
    cleared: true,
    notes: null,
  },
  {
    date: "2026-01-25",
    payee: "Groceries",
    amount: -250,
    cleared: true,
    notes: null,
  },
  {
    date: "2026-02-10",
    payee: "Salary Feb",
    amount: 2500,
    cleared: true,
    notes: null,
  },
  {
    date: "2026-02-20",
    payee: "Rent",
    amount: -500,
    cleared: true,
    notes: null,
  },
  {
    date: "2026-02-28",
    payee: "Utilities",
    amount: -547.8,
    cleared: true,
    notes: null,
  },
  {
    date: "2026-03-01",
    payee: "Pending Purchase",
    amount: -78,
    cleared: false,
    notes: null,
  },
  {
    date: "2026-03-05",
    payee: "Coffee",
    amount: -12.5,
    cleared: false,
    notes: null,
  },
];

// Indices of the two uncleared transactions (Pending Purchase, Coffee)
export const UNCLEARED_INDICES = [5, 6] as const;

export const TRANSACTIONS_B: TxBase[] = [
  {
    date: "2026-01-05",
    payee: "Transfer In",
    amount: 2000,
    cleared: true,
    notes: null,
  },
  {
    date: "2026-02-05",
    payee: "Withdrawal",
    amount: -500,
    cleared: true,
    notes: null,
  },
  {
    date: "2026-03-01",
    payee: "Interest",
    amount: 12.5,
    cleared: true,
    notes: null,
  },
];

// ─── Scheduled transaction fixtures ───────────────────────────────────────────
// accountId is omitted; test code adds it when inserting.

type ScheduledBase = {
  rrule: string;
  payee: string;
  amount: number;
  active: boolean;
  notes: string | null;
  nextDueDate: string | null;
  autoPost: boolean;
};

// 6 fixtures for Account A — cover every frequency variant and end-condition.
// Today is pinned to 2026-03-07 in all integration tests.
export const SCHEDULED_A: ScheduledBase[] = [
  {
    // Monthly on the 1st — no end condition, nextDue 2026-04-01
    rrule: "FREQ=MONTHLY;BYMONTHDAY=1",
    payee: "Monthly Salary",
    amount: 2500,
    active: true,
    notes: null,
    nextDueDate: "2026-04-01",
    autoPost: false,
  },
  {
    // Once, on 2026-07-15 — appears in 6-month window but NOT in 3-month window
    rrule: "DTSTART:20260715T000000Z\nRRULE:FREQ=DAILY;COUNT=1",
    payee: "Dentist",
    amount: -80,
    active: true,
    notes: null,
    nextDueDate: "2026-07-15",
    autoPost: false,
  },
  {
    // Weekly every Monday, UNTIL 2026-07-01 — nextDue 2026-03-09
    rrule: "FREQ=WEEKLY;BYDAY=MO;UNTIL=20260701T000000Z",
    payee: "Gym",
    amount: -45,
    active: true,
    notes: null,
    nextDueDate: "2026-03-09",
    autoPost: false,
  },
  {
    // Monthly on the 20th — no end condition, nextDue 2026-03-20
    rrule: "FREQ=MONTHLY;BYMONTHDAY=20",
    payee: "Standing Order",
    amount: -200,
    active: true,
    notes: null,
    nextDueDate: "2026-03-20",
    autoPost: false,
  },
  {
    // Monthly on 1st, COUNT=10 — DTSTART 2026-01-01 → occurrences Jan–Oct 2026
    // In 12-month window from today: Apr-Oct = 7; in 3-month: Apr-Jun = 3; in 6-month: Apr-Sep = 6
    rrule: "DTSTART:20260101T000000Z\nRRULE:FREQ=MONTHLY;BYMONTHDAY=1;COUNT=10",
    payee: "Council Tax",
    amount: -150,
    active: true,
    notes: null,
    nextDueDate: "2026-04-01",
    autoPost: false,
  },
  {
    // Every 2 months, COUNT=6 — DTSTART 2026-01-01 → Jan, Mar, May, Jul, Sep, Nov 2026
    // In 3-month window: May = 1; in 6-month: May, Jul, Sep = 3; in 12-month: May, Jul, Sep, Nov = 4
    rrule: "DTSTART:20260101T000000Z\nRRULE:FREQ=MONTHLY;INTERVAL=2;COUNT=6",
    payee: "Netflix",
    amount: -12.99,
    active: true,
    notes: null,
    nextDueDate: null,
    autoPost: false,
  },
];

// 3 fixtures for Account B
export const SCHEDULED_B: ScheduledBase[] = [
  {
    // Monthly savings transfer on the 15th
    rrule: "FREQ=MONTHLY;BYMONTHDAY=15",
    payee: "Savings Transfer",
    amount: -500,
    active: true,
    notes: null,
    nextDueDate: "2026-03-15",
    autoPost: false,
  },
  {
    // Annual on June 15 — appears exactly once in 12-month window
    rrule: "FREQ=YEARLY;BYMONTH=6;BYMONTHDAY=15",
    payee: "Birthday Transfer",
    amount: -100,
    active: true,
    notes: null,
    nextDueDate: "2026-06-15",
    autoPost: false,
  },
  {
    // Annual on Jan 1 — next occurrence 2027-01-01 (in 12-month window)
    rrule: "FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1",
    payee: "Annual Insurance",
    amount: -500,
    active: true,
    notes: null,
    nextDueDate: "2027-01-01",
    autoPost: false,
  },
];

// ─── Reconciliation checkpoint fixtures ───────────────────────────────────────
// Aligned with TRANSACTIONS_A dates and ACCOUNT_A opening balance (1000).
//
// Jan statement covers txs[0] Salary Jan (+2500) and txs[1] Groceries (-250):
//   openingBalance (1000) + 2500 - 250 = 3250
//
// Feb statement covers txs[2] Salary Feb (+2500), txs[3] Rent (-500),
//   txs[4] Utilities (-547.80) on top of the Jan reconciled balance (3250):
//   3250 + 2500 - 500 - 547.80 = 4702.20

export const RECONCILE_JAN = {
  date: "2026-01-31",
  balance: 3250,
} as const;

export const RECONCILE_FEB = {
  date: "2026-02-28",
  balance: 4702.2,
} as const;
