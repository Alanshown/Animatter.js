import { mkdtemp, mkdir, copyFile, cp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

// Real install verification. Packs the workspace packages into tarballs, then installs them into
// fresh consumer projects with npm and imports the public entry points. Nothing here publishes.
//
//   node scripts/verify-install.mjs                      tarballs at the workspace versions
//   node scripts/verify-install.mjs --version 0.2.0      temp copies relabelled 0.2.0 (repo unchanged)
//   node scripts/verify-install.mjs --registry 0.1.0     install the published versions from the registry
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const registryVersion = flag("--registry");
const overrideVersion = flag("--version");
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const npm = (cwd, a) =>
  execFileSync(npmCmd, a, { cwd, encoding: "utf8", timeout: 600000, stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" });
const results = [];
const record = (name, ok, detail = "") => {
  results.push({ name, ok, detail: String(detail).slice(0, 600) });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail && !ok ? `\n      ${String(detail).split("\n").slice(0, 6).join("\n      ")}` : ""}`);
};

const root = resolve(".");
const work = await mkdtemp(join(tmpdir(), "animatter-install-"));
const tgz = join(work, "tgz");
await mkdir(tgz, { recursive: true });

async function pack(folder) {
  const src = join(root, "packages", folder);
  const dst = join(work, "pkgs", folder);
  await mkdir(dst, { recursive: true });
  await cp(join(src, "dist"), join(dst, "dist"), { recursive: true });
  for (const f of ["README.md", "LICENSE"]) await copyFile(join(src, f), join(dst, f));
  const pkg = JSON.parse(await readFile(join(src, "package.json"), "utf8"));
  if (overrideVersion) pkg.version = overrideVersion;
  await writeFile(join(dst, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
  const out = npm(dst, ["pack", "--json", "--pack-destination", tgz, "--ignore-scripts"]);
  return { name: pkg.name, version: pkg.version, file: join(tgz, JSON.parse(out)[0].filename) };
}

const specs = {};
if (registryVersion) {
  specs.core = `animatter@${registryVersion}`;
  specs.react = `@animatter/react@${registryVersion}`;
  specs.vue = `@animatter/vue@${registryVersion}`;
} else {
  for (const folder of ["core", "react", "vue"]) {
    const p = await pack(folder);
    specs[folder] = p.file;
    console.log(`packed ${p.name}@${p.version} -> ${p.file}`);
  }
}

async function consumer(name, deps, script) {
  const dir = join(work, "consumer-" + name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "package.json"), JSON.stringify({ name: "consumer-" + name, version: "1.0.0", type: "module", private: true }, null, 2));
  try {
    npm(dir, ["install", "--no-audit", "--no-fund", ...deps]);
    record(`${name}: npm install ${deps.length ? "" : ""}ok`, true);
  } catch (error) {
    record(`${name}: npm install`, false, error.stderr || error.stdout || error.message);
    return;
  }
  await writeFile(join(dir, "check.mjs"), script);
  try {
    const out = execFileSync(process.execPath, ["check.mjs"], { cwd: dir, encoding: "utf8", timeout: 120000 });
    record(`${name}: import check`, true, out.trim());
  } catch (error) {
    record(`${name}: import check`, false, error.stderr || error.stdout || error.message);
  }
}

await consumer(
  "core-only",
  [specs.core ?? specs.core],
  `import * as am from "animatter";
if (typeof am.createWorld !== "function") throw new Error("createWorld missing");
console.log("createWorld, presets:", typeof am.presets?.elastic);
`,
);
// animatter/particles first shipped in 0.2.0; registry 0.1.0 correctly does not have it.
const hasParticles = !registryVersion || registryVersion >= "0.2.0";
if (hasParticles) await consumer(
  "core-particles-subpath",
  [specs.core],
  `const p = await import("animatter/particles");
if (typeof p.addParticleSystem !== "function") throw new Error("addParticleSystem missing");
console.log("animatter/particles exports addParticleSystem");
`,
);
await consumer(
  "react",
  [specs.core, specs.react, "react@19", "react-dom@19"],
  `const r = await import("@animatter/react");
if (!r.useAnimatter && !r.useSurface) throw new Error("adapter hooks missing");
console.log("@animatter/react exports:", Object.keys(r).join(", "));
`,
);
await consumer(
  "vue",
  [specs.core, specs.vue, "vue@3"],
  `const v = await import("@animatter/vue");
console.log("@animatter/vue exports:", Object.keys(v).join(", "));
`,
);

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} install checks passed. Work directory: ${work}`);
if (failed) process.exitCode = 1;
