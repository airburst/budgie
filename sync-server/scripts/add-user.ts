import { addUser } from "../src/admin";
import { createWranglerExecutor, parseTarget } from "./wrangler-executor";

const { positional, target } = parseTarget(process.argv.slice(2));
const [name] = positional;
if (!name) {
  console.error("Usage: add-user <name> [--remote] [--env staging]");
  process.exit(1);
}

try {
  const invite = await addUser(createWranglerExecutor(target), name);
  console.log(`Created user "${invite.userName}" (${invite.userId}).`);
  console.log(
    `Invite code (shown once, expires ${new Date(invite.expiresAt).toISOString()}):`,
  );
  console.log(invite.code);
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
