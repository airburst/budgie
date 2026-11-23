/** Object storage for snapshots, behind a small interface (R2 in the Worker, memory in tests). */
export interface SnapshotStore {
  put(key: string, body: string): Promise<void>;
  get(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
  /** Keys under a prefix. Optional: the wrangler CLI store cannot list. */
  list?(prefix: string): Promise<string[]>;
}

/** The slice of the R2 bucket binding this project uses. */
export interface R2BucketLike {
  put(key: string, value: string): Promise<unknown>;
  get(key: string): Promise<{ text(): Promise<string> } | null>;
  delete(key: string): Promise<void>;
  list(options: { prefix: string; cursor?: string }): Promise<{
    objects: { key: string }[];
    truncated: boolean;
    cursor?: string;
  }>;
}

export function createR2Store(bucket: R2BucketLike): SnapshotStore {
  return {
    async put(key, body) {
      await bucket.put(key, body);
    },
    async get(key) {
      const object = await bucket.get(key);
      return object ? object.text() : null;
    },
    delete: (key) => bucket.delete(key),
    async list(prefix) {
      const keys: string[] = [];
      let cursor: string | undefined;
      for (;;) {
        const page = await bucket.list({ prefix, cursor });
        keys.push(...page.objects.map((o) => o.key));
        if (!page.truncated) return keys;
        cursor = page.cursor;
      }
    },
  };
}

export class MemoryStore implements SnapshotStore {
  readonly objects = new Map<string, string>();
  put(key: string, body: string) {
    this.objects.set(key, body);
    return Promise.resolve();
  }
  get(key: string) {
    return Promise.resolve(this.objects.get(key) ?? null);
  }
  delete(key: string) {
    this.objects.delete(key);
    return Promise.resolve();
  }
  list(prefix: string) {
    return Promise.resolve(
      [...this.objects.keys()].filter((k) => k.startsWith(prefix)),
    );
  }
}

export const snapshotPrefix = (userId: string) => `snapshots/${userId}/`;

export const snapshotKey = (userId: string, date: string) =>
  `snapshots/${userId}/${date}.json`;
