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
    "@aastack/core/terrain": resolve(ROOT, "packages/core/dist/terrain-shader.js"),
    "@aastack/core": resolve(ROOT, "packages/core/dist/index.js"),
    "@aastack/blueprint": resolve(ROOT, "packages/blueprint/dist/index.js"),
    "@aastack/bridge/client": resolve(ROOT, "packages/bridge/dist/client.js"),
    "@aastack/bridge": resolve(ROOT, "packages/bridge/dist/index.js"),
  },
});

console.log("Bundled examples/flight-6dof/bundle.js");

const MINIMAL_DIR = resolve(ROOT, "examples/minimal-2d");
await build({
  entryPoints: [resolve(MINIMAL_DIR, "src/main.ts")],
  outfile: resolve(MINIMAL_DIR, "bundle.js"),
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
  sourcemap: true,
  alias: {
    "@aastack/core": resolve(ROOT, "packages/core/dist/index.js"),
    "@aastack/blueprint": resolve(ROOT, "packages/blueprint/dist/index.js"),
  },
});

console.log("Bundled examples/minimal-2d/bundle.js");

const AIRWOLF_DIR = resolve(ROOT, "examples/airwolf-city");
await build({
  entryPoints: [resolve(AIRWOLF_DIR, "src/main.ts")],
  outfile: resolve(AIRWOLF_DIR, "bundle.js"),
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
  sourcemap: true,
  alias: {
    "@aastack/core": resolve(ROOT, "packages/core/dist/index.js"),
  },
});

console.log("Bundled examples/airwolf-city/bundle.js");

const XMAS_DIR = resolve(ROOT, "examples/xmas-mainstreet");
await build({
  entryPoints: [resolve(XMAS_DIR, "src/main.ts")],
  outfile: resolve(XMAS_DIR, "bundle.js"),
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
  sourcemap: true,
  alias: {
    "@aastack/core": resolve(ROOT, "packages/core/dist/index.js"),
  },
});

console.log("Bundled examples/xmas-mainstreet/bundle.js");

const GEOFIELD_DIR = resolve(ROOT, "examples/geofield-showcase");
await build({
  entryPoints: [resolve(GEOFIELD_DIR, "src/main.ts")],
  outfile: resolve(GEOFIELD_DIR, "bundle.js"),
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
  sourcemap: true,
  alias: {
    "@aastack/core": resolve(ROOT, "packages/core/dist/index.js"),
    "@aastack/geofield": resolve(ROOT, "packages/geofield/dist/index.js"),
  },
});

console.log("Bundled examples/geofield-showcase/bundle.js");
