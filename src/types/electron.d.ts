import type { tasks } from "@/main/db/schema";
import type { InferSelectModel } from "drizzle-orm";

export type Task = InferSelectModel<typeof tasks>;

interface ElectronAPI {
  getTasks: () => Promise<Task[]>;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}
