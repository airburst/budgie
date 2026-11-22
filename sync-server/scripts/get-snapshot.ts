import { writeFileSync } from "node:fs";
import { getSnapshot } from "../src/admin-snapshots";
import { createWranglerR2Store } from "./wrangler-r2-store";
import { createWranglerExecutor, parseTarget } from "./wrangler-executor";

const argv = process.argv.slice(2);
const outIndex = argv.indexOf("--out");
const out = outIndex >= 0 ? argv[outIndex + 1] : undefined;
const { positional, target } = parseTarget(
  argv.filter((_, i) => (i !== outIndex && i !== outIndex + 1) || outIndex < 0),
);
const [name, date] = positional;
if (!name || !date) {
  console.error(
    "Usage: get-snapshot <user> <YYYY-MM-DD> [--out file] [--remote] [--env staging]",
  );
  process.exit(1);
}

try {
  const text = await getSnapshot(
    createWranglerExecutor(target),
    createWranglerR2Store(target),
    name,
    date,
  );
  const file = out ?? `snapshot-${name}-${date}.json`;
  writeFileSync(file, text);
  console.log(`Wrote ${file} (${text.length} characters).`);
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
