import { readFile, mkdir, writeFile, cp, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
await mkdir("artifacts/packages", { recursive: true });
const report = [];
for (const folder of ["core", "react", "vue"]) {
  const dir = `packages/${folder}`,
    pkg = JSON.parse(await readFile(`${dir}/package.json`, "utf8"));
  await cp("LICENSE", `${dir}/LICENSE`);
  const packed = JSON.parse(
    execFileSync(
      process.env.npm_execpath ? process.execPath : "npm",
      [
        ...(process.env.npm_execpath ? [process.env.npm_execpath] : []),
        "pack",
        `./${dir}`,
        "--json",
        "--offline",
        "--ignore-scripts",
        "--pack-destination",
        "artifacts/packages",
      ],
      { encoding: "utf8", timeout: 30000 },
    ),
  )[0];
  const extract = resolve("artifacts/consumer/node_modules", pkg.name);
  await mkdir(extract, { recursive: true });
  execFileSync("tar", [
    "-xzf",
    resolve("artifacts/packages", packed.filename),
    "--strip-components=1",
    "-C",
    extract,
  ]);
  const paths = packed.files.map((f) => f.path);
  assert.ok(paths.includes("dist/index.d.ts"));
  assert.ok(paths.includes("dist/index.js"));
  assert.ok(paths.includes("LICENSE"));
  assert.ok(
    !paths.some(
      (p) =>
        p.startsWith("src/") || p.includes("test") || p.includes("tsbuildinfo"),
    ),
  );
  const mod = await import(pathToFileURL(resolve(dir, "dist/index.js")).href);
  assert.ok(Object.keys(mod).length > 0);
  if (folder === "core") {
    for (const key of [
      "createWorld",
      "PhysicsEngine",
      "InteractionArbiter",
      "sequence",
      "MotionMixer",
      "orbitalField",
      "devtools",
    ])
      assert.equal(typeof mod[key], "function");
    assert.ok(paths.includes("dist/materials.css"));
    assert.ok(paths.includes("dist/animatter.js"));
  }
  report.push({
    name: pkg.name,
    version: pkg.version,
    tarball: packed.filename,
    bytes: packed.size,
    unpackedBytes: packed.unpackedSize,
    files: paths.length,
    exports: Object.keys(mod),
  });
}
const dir = "artifacts/consumer";
for (const dep of ["react", "vue", "@types"]) {
  const dest = resolve(dir, "node_modules", dep);
  try {
    await symlink(resolve("node_modules", dep), dest, "dir");
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
  }
}
await mkdir(dir, { recursive: true });
await writeFile(`${dir}/package.json`, '{"type":"module"}');
await writeFile(
  `${dir}/index.ts`,
  `import {createWorld,materials,sequence,type ActorRenderer,type BehaviorBinding,type WorldOptions} from 'animatter';\nimport {useAnimatter as react} from '@animatter/react';import {useAnimatter as vue} from '@animatter/vue';\nconst options:WorldOptions={mode:'both',material:materials.elastic};const world=createWorld(options);world.emit('success','x');world.bind({id:'x',on:'click',create:()=>sequence([{duration:.2}])} satisfies BehaviorBinding<typeof world>);const refs=[react,vue];void refs;let renderer:ActorRenderer|null=null;void renderer;world.destroy();`,
);
execFileSync(
  process.execPath,
  [
    "node_modules/typescript/bin/tsc",
    "--strict",
    "--skipLibCheck",
    "--target",
    "ES2022",
    "--module",
    "NodeNext",
    "--moduleResolution",
    "NodeNext",
    "--noEmit",
    `${dir}/index.ts`,
  ],
  { stdio: "pipe" },
);
execFileSync(
  process.execPath,
  [
    "--input-type=module",
    "-e",
    "import {createWorld} from 'animatter';import {useAnimatter} from '@animatter/react';import * as vue from '@animatter/vue';if(typeof createWorld!=='function'||typeof useAnimatter!=='function'||typeof vue.useSurface!=='function')throw Error('Broken exports');",
  ],
  { cwd: resolve(dir), stdio: "pipe" },
);
await mkdir("test-results", { recursive: true });
await writeFile(
  "test-results/package-results.json",
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify(
    report.map(({ name, bytes, files }) => ({ name, bytes, files })),
    null,
    2,
  ),
);
