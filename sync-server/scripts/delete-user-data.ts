import { adminDeleteUserData } from "../src/admin-ops";
import { createWranglerR2Store } from "./wrangler-r2-store";
import { createWranglerExecutor, parseTarget } from "./wrangler-executor";

const argv = process.argv.slice(2);
const removeUser = argv.includes("--remove-user");
const { positional, target } = parseTarget(
  argv.filter((a) => a !== "--remove-user"),
);
const [name] = positional;
if (!name) {
  console.error(
    "Usage: delete-user-data <user> [--remove-user] [--remote] [--env staging]",
  );
  process.exit(1);
}

try {
  const r = await adminDeleteUserData(
    createWranglerExecutor(target),
    createWranglerR2Store(target),
    name,
    { removeUser },
  );
  console.log(
    `Deleted ${r.deletedRows} rows and ${r.deletedSnapshots} snapshots for "${name}".`,
  );
  if (r.userRemoved) console.log("User, devices and codes removed.");
  console.log(
    "D1 Time Travel may still hold the deleted rows for up to 7 days.",
  );
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
