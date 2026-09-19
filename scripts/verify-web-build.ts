import { access, readFile, stat } from "node:fs/promises";
import { extname, join } from "node:path";

const buildDirectory = join(import.meta.dir, "..", "build");
const requiredFiles = [
  "index.html",
  "manifest.webmanifest",
  "sw.js",
  "budgie-icon.svg",
];

for (const file of requiredFiles) await access(join(buildDirectory, file));

const manifest = JSON.parse(
  await readFile(join(buildDirectory, "manifest.webmanifest"), "utf8"),
) as {
  name?: string;
  short_name?: string;
  start_url?: string;
  display?: string;
  icons?: Array<{ src?: string; type?: string }>;
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

const serviceWorker = await readFile(join(buildDirectory, "sw.js"), "utf8");
if (!serviceWorker.includes("const PRECACHE_URLS = ["))
  throw new Error(
    "The service worker does not contain a generated precache list",
  );

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
