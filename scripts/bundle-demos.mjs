import { build } from "esbuild";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

await build({
  entryPoints: [resolve(ROOT, "examples/flight-6dof/src/main.ts")],
  outfile: resolve(ROOT, "examples/flight-6dof/bundle.js"),
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

console.log("Bundled examples/flight-6dof/bundle.js");
