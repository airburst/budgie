export type SystemShortcut = {
  key: string;
  ctrl: boolean;
  label: string;
  note?: string;
};

export const GLOBAL_ROUTE_SHORTCUTS: Array<SystemShortcut & { path: string }> =
  [
    { key: "a", ctrl: false, label: "Accounts", path: "/" },
    {
      key: "s",
      ctrl: false,
      label: "Subscriptions",
      path: "/scheduled",
    },
    { key: "b", ctrl: false, label: "Budget", path: "/budget" },
  ];

export const ACCOUNT_PAGE_SHORTCUTS: SystemShortcut[] = [
  { key: "f", ctrl: false, label: "Forecast", note: "account page" },
  { key: "r", ctrl: false, label: "Reconcile", note: "account page" },
];

export const SYSTEM_SHORTCUTS: SystemShortcut[] = [
  ...GLOBAL_ROUTE_SHORTCUTS,
  ...ACCOUNT_PAGE_SHORTCUTS,
];
