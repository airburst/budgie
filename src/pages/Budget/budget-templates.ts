export type BudgetTemplate = {
  name: string;
  description: string;
  envelopes: {
    name: string;
    categoryPatterns: string[];
  }[];
};

export const BUDGET_TEMPLATES: BudgetTemplate[] = [
  {
    name: "Starter",
    description: "5 envelopes covering common spending areas",
    envelopes: [
      { name: "Bills", categoryPatterns: ["Bills", "Council Tax", "Mobile"] },
      { name: "Food", categoryPatterns: ["Groceries"] },
      {
        name: "Transport",
        categoryPatterns: ["Motoring", "Petrol", "Parking"],
      },
      {
        name: "Personal",
        categoryPatterns: ["Clothing", "Entertainment", "Fitness"],
      },
      { name: "Savings", categoryPatterns: [] },
    ],
  },
  {
    name: "Detailed",
    description: "8 envelopes with finer-grained category mapping",
    envelopes: [
      { name: "Mortgage/Rent", categoryPatterns: ["Rent", "Mortgage"] },
      { name: "Utilities", categoryPatterns: ["Electric", "Gas", "Water"] },
      {
        name: "Insurance",
        categoryPatterns: [
          "Insurance",
          "Home Insurance",
          "Car Insurance",
          "Life Insurance",
        ],
      },
      { name: "Food", categoryPatterns: ["Groceries", "Dining out", "Wine"] },
      {
        name: "Transport",
        categoryPatterns: ["Motoring", "Petrol", "Parking", "Travel"],
      },
      {
        name: "Healthcare",
        categoryPatterns: ["Healthcare", "Dentist", "Optician"],
      },
      {
        name: "Personal",
        categoryPatterns: [
          "Clothing",
          "Entertainment",
          "Fitness",
          "Personal care",
        ],
      },
      { name: "Savings", categoryPatterns: [] },
    ],
  },
  {
    name: "Minimal",
    description: "3 broad envelopes — keep it simple",
    envelopes: [
      {
        name: "Essentials",
        categoryPatterns: [
          "Bills",
          "Council Tax",
          "Groceries",
          "Motoring",
          "Mobile",
          "Insurance",
        ],
      },
      {
        name: "Everything Else",
        categoryPatterns: [
          "Clothing",
          "Entertainment",
          "Fitness",
          "Dining out",
          "Holiday",
        ],
      },
      { name: "Savings", categoryPatterns: [] },
    ],
  },
];
