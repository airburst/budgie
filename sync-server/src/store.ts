/** Object storage for snapshots, behind a small interface (R2 in the Worker, memory in tests). */
export interface SnapshotStore {
  put(key: string, body: string): Promise<void>;
  get(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
}

/** The slice of the R2 bucket binding this project uses. */
export interface R2BucketLike {
  put(key: string, value: string): Promise<unknown>;
  get(key: string): Promise<{ text(): Promise<string> } | null>;
  delete(key: string): Promise<void>;
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
}

export const snapshotKey = (userId: string, date: string) =>
  `snapshots/${userId}/${date}.json`;
