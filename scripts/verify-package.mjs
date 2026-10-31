import { readFile, mkdir, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
const npm = (args, cwd = resolve(".")) =>
  execFileSync(
    process.env.npm_execpath ? process.execPath : "npm",
    [...(process.env.npm_execpath ? [process.env.npm_execpath] : []), ...args],
    {
      cwd,
      encoding: "utf8",
      timeout: 120000,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
const root = JSON.parse(await readFile("package.json", "utf8"));
const output = resolve("artifacts/packages");
await mkdir(output, { recursive: true });
const report = [],
  archives = [];
const targets = (value) =>
  typeof value === "string" ? [value] : Object.values(value).flatMap(targets);
for (const folder of ["core", "react", "vue"]) {
  const dir = `packages/${folder}`;
  const pkg = JSON.parse(await readFile(`${dir}/package.json`, "utf8"));
  assert.equal(pkg.version, root.version, "Workspace versions must agree");
  assert.equal(pkg.type, "module");
  assert.equal(pkg.license, "MIT");
  assert.equal(pkg.publishConfig.registry, "https://registry.npmjs.org/");
  assert.equal(pkg.publishConfig.access, "public");
  assert.equal(
    await readFile(`${dir}/LICENSE`, "utf8"),
    await readFile("LICENSE", "utf8"),
  );
  const args = ["pack", `./${dir}`, "--json", "--offline", "--ignore-scripts"];
  const dry = JSON.parse(npm([...args, "--dry-run"]))[0];
  const packed = JSON.parse(npm([...args, "--pack-destination", output]))[0];
  const paths = packed.files.map((f) => f.path).sort();
  assert.deepEqual(paths, dry.files.map((f) => f.path).sort());
  assert.ok(
    paths.every(
      (p) =>
        p.startsWith("dist/") ||
        ["package.json", "README.md", "LICENSE"].includes(p),
    ),
  );
  assert.ok(
    !paths.some((p) =>
      /(?:node_modules|tsbuildinfo|\.env|\.tgz|\.png|\.gif|test-results)/.test(
        p,
      ),
    ),
  );
  for (const path of [...targets(pkg.exports), pkg.types, pkg.main]) {
    assert.ok(path.startsWith("./dist/"));
    assert.ok(paths.includes(path.slice(2)), `Missing export ${path}`);
  }
  for (const file of [
    "dist/index.js",
    "dist/index.d.ts",
    "README.md",
    "LICENSE",
  ])
    assert.ok(paths.includes(file));
  if (folder === "core") {
    assert.deepEqual(pkg.dependencies ?? {}, {});
    assert.deepEqual(pkg.peerDependencies ?? {}, {});
    assert.deepEqual(pkg.sideEffects, ["**/*.css"]);
    assert.ok(paths.includes("dist/materials.css"));
    assert.ok(paths.includes("dist/animatter.js"));
  } else {
    assert.equal(pkg.sideEffects, false);
    assert.equal(pkg.peerDependencies.animatter, "^0.1.0");
    assert.equal(
      pkg.peerDependencies[folder],
      folder === "react" ? ">=18" : ">=3.3",
    );
    assert.deepEqual(pkg.dependencies ?? {}, {});
  }
  const archive = resolve(output, packed.filename);
  archives.push(archive);
  report.push({
    name: pkg.name,
    version: pkg.version,
    tarball: packed.filename,
    bytes: packed.size,
    unpackedBytes: packed.unpackedSize,
    integrity: packed.integrity,
    files: paths.length,
    contents: paths,
    exports: pkg.exports,
    dryRunMatches: true,
  });
}
const consumer = resolve("artifacts/consumer");
await rm(consumer, { recursive: true, force: true });
await mkdir(consumer, { recursive: true });
await writeFile(
  `${consumer}/package.json`,
  JSON.stringify({
    name: "animatter-tarball-consumer",
    private: true,
    type: "module",
  }),
);
// Real npm installation: no manual extraction or workspace dependency symlinks.
const peers = [
  "react",
  "react-dom",
  "vue",
  "@types/react",
  "@types/react-dom",
].map((name) => `${name}@${root.devDependencies[name]}`);
npm(
  [
    "install",
    "--prefer-offline",
    "--fetch-retries=0",
    "--fetch-timeout=30000",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    ...archives,
    ...peers,
  ],
  consumer,
);
const tree = JSON.parse(npm(["ls", "--json"], consumer));
await writeFile(
  `${consumer}/index.ts`,
  `import {createWorld,materials,sequence,type ActorRenderer,type BehaviorBinding,type WorldOptions} from 'animatter';
import {createWorld as browserWorld} from 'animatter/browser';import {useAnimatter as react} from '@animatter/react';import {useAnimatter as vue} from '@animatter/vue';void browserWorld;
const options:WorldOptions={mode:'both',material:materials.elastic};
// Typechecked only: DOM world construction belongs after client mount.
const world=createWorld(options);world.emit('success','x');world.bind({id:'x',on:'click',create:()=>sequence([{duration:.2}])} satisfies BehaviorBinding<typeof world>);
const refs=[react,vue];void refs;let renderer:ActorRenderer|null=null;void renderer;world.destroy();
`,
);
execFileSync(
  process.execPath,
  [
    resolve("node_modules/typescript/bin/tsc"),
    "--strict",
    "--target",
    "ES2022",
    "--module",
    "NodeNext",
    "--moduleResolution",
    "NodeNext",
    "--noEmit",
    "index.ts",
  ],
  { cwd: consumer, stdio: "pipe" },
);
await writeFile(
  `${consumer}/import.mjs`,
  `import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as core from 'animatter';import * as browser from 'animatter/browser';
import * as react from '@animatter/react';import * as vue from '@animatter/vue';
assert.equal(typeof globalThis.document,'undefined');assert.equal(typeof globalThis.window,'undefined');
for(const key of ['createWorld','PhysicsEngine','InteractionArbiter','sequence','MotionMixer','orbitalField','devtools']) assert.equal(typeof core[key],'function');
assert.deepEqual(Object.keys(browser).sort(),Object.keys(core).sort());
assert.equal(typeof react.useAnimatter,'function');assert.equal(typeof vue.useSurface,'function');
assert.ok(readFileSync(new URL(import.meta.resolve('animatter/materials.css')),'utf8').includes('--am-'));
console.log('Installed tarball ESM, browser subpath, CSS resolution and SSR-safe imports passed');
`,
);
const importOutput = execFileSync(process.execPath, ["import.mjs"], {
  cwd: consumer,
  encoding: "utf8",
});
const { build } = await import("esbuild");
await writeFile(
  `${consumer}/styles.js`,
  "import 'animatter/materials.css';export {createWorld} from 'animatter';",
);
const bundled = await build({
  absWorkingDir: consumer,
  entryPoints: ["styles.js"],
  outdir: "bundle",
  bundle: true,
  format: "esm",
  write: false,
  metafile: true,
});
assert.ok(
  bundled.outputFiles.some(
    (f) => f.path.endsWith(".css") && f.text.includes("--am-"),
  ),
  "CSS removed by tree shaking",
);
assert.ok(
  !Object.keys(bundled.metafile.inputs).some((p) =>
    /node_modules\/(react|vue)\//.test(p),
  ),
  "Framework runtime leaked into core",
);
const result = {
  checkedAt: new Date().toISOString(),
  node: process.version,
  npm: npm(["--version"]).trim(),
  packages: report,
  installedPeers: Object.fromEntries(
    Object.entries(tree.dependencies).map(([k, v]) => [k, v.version]),
  ),
  checks: {
    realTarballInstall: true,
    esm: true,
    browserSubpath: true,
    ssrSafeImport: true,
    types: true,
    cssResolution: true,
    cssTreeShaking: true,
    coreFrameworkIsolation: true,
    peerDependencyTree: true,
  },
};
await mkdir("test-results", { recursive: true });
await writeFile(
  "test-results/package-results.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(importOutput.trim());
console.log(
  JSON.stringify(
    report.map(({ name, bytes, files }) => ({ name, bytes, files })),
    null,
    2,
  ),
);
