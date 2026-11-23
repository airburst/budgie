import { revokeDevice } from "../src/admin-ops";
import { createWranglerExecutor, parseTarget } from "./wrangler-executor";

const { positional, target } = parseTarget(process.argv.slice(2));
const [deviceId] = positional;
if (!deviceId) {
  console.error("Usage: revoke-device <deviceId> [--remote] [--env staging]");
  process.exit(1);
}

try {
  const { revoked } = await revokeDevice(
    createWranglerExecutor(target),
    deviceId,
  );
  console.log(revoked ? "Device revoked." : "Device was already revoked.");
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
