import type { accounts, tasks } from "@/main/db/schema";
import type { InferSelectModel } from "drizzle-orm";

export type Task = InferSelectModel<typeof tasks>;
export type Account = InferSelectModel<typeof accounts>;

interface ElectronAPI {
  getTasks: () => Promise<Task[]>;

  getAccounts: () => Promise<Account[]>;
  getAccount: (id: number) => Promise<Account | null>;
  createAccount: (
    data: Omit<Account, "id" | "createdAt">,
  ) => Promise<Account[]>;
  updateAccount: (
    id: number,
    data: Partial<Omit<Account, "id" | "createdAt">>,
  ) => Promise<Account[]>;
  deleteAccount: (id: number) => Promise<void>;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}
