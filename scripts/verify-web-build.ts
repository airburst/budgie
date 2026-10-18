import { access, readFile, stat } from "node:fs/promises";
import { extname, join } from "node:path";

const buildDirectory = join(import.meta.dir, "..", "build");
const requiredFiles = [
  "index.html",
  "manifest.webmanifest",
  "sw.js",
  "favicon.ico",
  "icons/apple-touch-icon.png",
  "_headers",
];

for (const file of requiredFiles) await access(join(buildDirectory, file));

const headers = await readFile(join(buildDirectory, "_headers"), "utf8");
for (const header of [
  "Cross-Origin-Opener-Policy: same-origin",
  "Cross-Origin-Embedder-Policy: require-corp",
  "Content-Security-Policy: default-src 'self'",
  "X-Content-Type-Options: nosniff",
  "X-Frame-Options: DENY",
  "Referrer-Policy: no-referrer",
  "Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()",
]) {
  if (!headers.includes(`  ${header}`))
    throw new Error(`Missing Cloudflare header: ${header}`);
}

if (
  !headers.includes(
    "/assets/*\n  Cache-Control: public, max-age=31536000, immutable",
  )
)
  throw new Error("Missing immutable cache header for /assets/*");

const manifest = JSON.parse(
  await readFile(join(buildDirectory, "manifest.webmanifest"), "utf8"),
) as {
  name?: string;
  short_name?: string;
  start_url?: string;
  display?: string;
  icons?: Array<{
    src?: string;
    type?: string;
    sizes?: string;
    purpose?: string;
  }>;
};

if (
  !manifest.name ||
  !manifest.short_name ||
  !manifest.start_url ||
  manifest.display !== "standalone" ||
  !manifest.icons?.length
)
  throw new Error("The web manifest is missing required install fields");

for (const icon of manifest.icons) {
  if (!icon.src || !icon.type) throw new Error("Manifest icon is incomplete");
  await access(join(buildDirectory, icon.src.replace(/^\.\//, "")));
}

// Android needs 192 and 512 PNGs plus a maskable one; iOS uses the
// apple-touch-icon link (checked with the HTML references below).
const hasIcon = (size: string, purpose: string) =>
  manifest.icons?.some(
    (icon) =>
      icon.type === "image/png" &&
      icon.sizes === size &&
      (icon.purpose ?? "any").split(" ").includes(purpose),
  ) ?? false;
for (const [size, purpose] of [
  ["192x192", "any"],
  ["512x512", "any"],
  ["512x512", "maskable"],
] as const) {
  if (!hasIcon(size, purpose))
    throw new Error(`Manifest is missing a ${size} ${purpose} PNG icon`);
}

const serviceWorker = await readFile(join(buildDirectory, "sw.js"), "utf8");
if (!serviceWorker.includes("const PRECACHE_URLS = ["))
  throw new Error(
    "The service worker does not contain a generated precache list",
  );
if (serviceWorker.includes('"./_headers"'))
  throw new Error("Cloudflare configuration must not be precached");

const files = (await stat(buildDirectory)).isDirectory();
if (!files) throw new Error("Web build output is not a directory");

const html = await readFile(join(buildDirectory, "index.html"), "utf8");
const assetReferences = [...html.matchAll(/(?:src|href)="(\.?\/[^"]+)"/g)]
  .map((match) => match[1])
  .filter((reference): reference is string => Boolean(reference));
for (const reference of assetReferences) {
  if (!extname(reference)) continue;
  try {
    await access(join(buildDirectory, reference.replace(/^\.\//, "")));
  } catch {
    throw new Error(`Missing generated asset: ${reference}`);
  }
}

console.log(
  `Web build verified: ${requiredFiles.length} required files and ${assetReferences.length} HTML asset references.`,
);
