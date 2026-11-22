import { listSnapshots } from "../src/admin-snapshots";
import { createWranglerExecutor, parseTarget } from "./wrangler-executor";

const { positional, target } = parseTarget(process.argv.slice(2));
const [name] = positional;
if (!name) {
  console.error("Usage: list-snapshots <user> [--remote] [--env staging]");
  process.exit(1);
}

try {
  const list = await listSnapshots(createWranglerExecutor(target), name);
  if (list.length === 0) console.log("No snapshots.");
  for (const s of list) console.log(`${s.date}  ${s.size} bytes`);
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
