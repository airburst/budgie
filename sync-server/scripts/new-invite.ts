import { newInvite } from "../src/admin";
import { createWranglerExecutor, parseTarget } from "./wrangler-executor";

const { positional, target } = parseTarget(process.argv.slice(2));
const [name] = positional;
if (!name) {
  console.error("Usage: new-invite <user> [--remote] [--env staging]");
  process.exit(1);
}

try {
  const invite = await newInvite(createWranglerExecutor(target), name);
  console.log(`New invite for "${invite.userName}" (${invite.userId}).`);
  console.log(
    `Invite code (shown once, expires ${new Date(invite.expiresAt).toISOString()}):`,
  );
  console.log(invite.code);
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
