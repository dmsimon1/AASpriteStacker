import { build } from "esbuild";
import { readdirSync, unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FLIGHT_DIR = resolve(ROOT, "examples/flight-6dof");

// Clean stale dev-bridge chunks before bundling
for (const name of readdirSync(FLIGHT_DIR)) {
  if (name.startsWith("dev-bridge-")) unlinkSync(resolve(FLIGHT_DIR, name));
}

await build({
  entryPoints: { bundle: resolve(FLIGHT_DIR, "src/main.ts") },
  outdir: FLIGHT_DIR,
  bundle: true,
  splitting: true,
  chunkNames: "dev-bridge-[name]-[hash]",
  format: "esm",
  target: "es2022",
  minify: true,
  sourcemap: true,
  alias: {
    "@aastack/core": resolve(ROOT, "packages/core/dist/index.js"),
    "@aastack/blueprint": resolve(ROOT, "packages/blueprint/dist/index.js"),
    "@aastack/bridge/client": resolve(ROOT, "packages/bridge/dist/client.js"),
    "@aastack/bridge": resolve(ROOT, "packages/bridge/dist/index.js"),
  },
});

console.log("Bundled examples/flight-6dof/bundle.js");
