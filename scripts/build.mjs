import { build } from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";
await mkdir("packages/core/dist", { recursive: true });
await build({
  entryPoints: ["packages/core/src/index.ts"],
  outfile: "packages/core/dist/animatter.js",
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
  sourcemap: true,
});
await copyFile(
  "packages/core/src/materials.css",
  "packages/core/dist/materials.css",
);
await build({
  entryPoints: ["tests/fixtures/adapters.ts"],
  outfile: "artifacts/adapters.js",
  bundle: true,
  format: "esm",
  target: "es2022",
});
