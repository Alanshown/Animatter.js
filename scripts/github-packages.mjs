// Registry-specific staging only. Never changes the npm workspace packages.
import assert from "node:assert/strict";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";

const root = resolve(".");
const output = resolve("artifacts/github-packages");
const registry = "https://npm.pkg.github.com";
const core = "@alanshown/animatter";
const names = [core, `${core}-react`, `${core}-vue`];
const folders = ["core", "react", "vue"];
const version = JSON.parse(await readFile("package.json", "utf8")).version;
const run = (command, args, cwd = root) =>
  execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    timeout: 120000,
    stdio: ["ignore", "pipe", "pipe"],
  });
const npm = (args, cwd = root) => run("npm", args, cwd);
const rewrite = (text) =>
  text
    .replaceAll("@animatter/react", names[1])
    .replaceAll("@animatter/vue", names[2])
    .replace(/(?<![\w/@-])animatter(?=\/|["'`\s@]|$)/g, core);

async function stage() {
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  const packages = [];
  for (const [index, folder] of folders.entries()) {
    const source = resolve(`packages/${folder}`);
    const dest = resolve(output, folder);
    const pkg = JSON.parse(await readFile(`${source}/package.json`, "utf8"));
    assert.equal(pkg.version, version);
    await mkdir(dest, { recursive: true });
    await cp(`${source}/dist`, `${dest}/dist`, { recursive: true });
    await cp(`${source}/LICENSE`, `${dest}/LICENSE`);
    // Adapter imports and declaration imports must resolve to the same core.
    // Omit adapter maps rather than shipping mappings invalidated by renaming.
    if (folder !== "core") {
      for (const file of await readdir(`${dest}/dist`)) {
        if (file.endsWith(".map")) {
          await rm(`${dest}/dist/${file}`);
        } else if (/\.(?:js|ts)$/.test(file)) {
          const text = await readFile(`${dest}/dist/${file}`, "utf8");
          await writeFile(
            `${dest}/dist/${file}`,
            text
              .replace(/(["'])animatter\1/g, `$1${core}$1`)
              .replace(/\/\/# sourceMappingURL=.*$/gm, ""),
          );
        }
      }
      pkg.peerDependencies[core] = pkg.peerDependencies.animatter;
      delete pkg.peerDependencies.animatter;
    }
    pkg.name = names[index];
    pkg.publishConfig = { access: "public", registry };
    await writeFile(
      `${dest}/package.json`,
      JSON.stringify(pkg, null, 2) + "\n",
    );
    await writeFile(
      `${dest}/README.md`,
      `# ${pkg.name}\n\nGitHub Packages distribution of Animatter.js ${version}. ` +
        "See the repository for architecture, acceptance evidence and npm installation.\n\n" +
        "Configure `@alanshown:registry=https://npm.pkg.github.com` and authenticate " +
        "with GitHub before installing. Do not mix the GitHub and npm adapter/core families.\n\n" +
        rewrite(await readFile(`${source}/README.md`, "utf8")),
    );
    const args = ["pack", dest, "--json", "--ignore-scripts", "--offline"];
    const dry = JSON.parse(npm([...args, "--dry-run"]))[0];
    const pack = JSON.parse(npm([...args, "--pack-destination", output]))[0];
    assert.deepEqual(dry.files, pack.files);
    assert.ok(
      pack.files.every(
        ({ path }) =>
          path.startsWith("dist/") ||
          ["LICENSE", "README.md", "package.json"].includes(path),
      ),
    );
    packages.push({
      name: pkg.name,
      version,
      filename: pack.filename,
      integrity: pack.integrity,
    });
  }
  await writeFile(
    `${output}/manifest.json`,
    JSON.stringify(packages, null, 2) + "\n",
  );
  return packages;
}

async function verify(packages, remote = false) {
  const consumer = resolve(output, remote ? "registry-consumer" : "consumer");
  await rm(consumer, { recursive: true, force: true });
  await mkdir(consumer, { recursive: true });
  await writeFile(
    `${consumer}/package.json`,
    JSON.stringify({ private: true, type: "module" }),
  );
  npm(
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--fetch-retries=0",
      ...packages.map((p) =>
        remote ? `${p.name}@${p.version}` : resolve(output, p.filename),
      ),
      "react@19.2.0",
      "react-dom@19.2.0",
      "vue@3.5.44",
      "@types/react@19.2.2",
      "@types/react-dom@19.2.2",
    ],
    consumer,
  );
  const tree = JSON.parse(npm(["ls", "--json"], consumer));
  assert.ok(
    !tree.dependencies.animatter,
    "npm core must not be installed alongside the GitHub core",
  );
  for (const name of names)
    assert.equal(tree.dependencies[name].version, version);
  for (const file of ["index.ts", "import.mjs", "styles.js"]) {
    const fixture = await readFile(`artifacts/consumer/${file}`, "utf8");
    await writeFile(`${consumer}/${file}`, rewrite(fixture));
  }
  run(
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
    consumer,
  );
  console.log(run(process.execPath, ["import.mjs"], consumer).trim());
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
  );
  assert.ok(
    !Object.keys(bundled.metafile.inputs).some((p) =>
      /node_modules\/(react|vue)\//.test(p),
    ),
  );
  if (remote) {
    const lock = JSON.parse(
      await readFile(`${consumer}/package-lock.json`, "utf8"),
    );
    for (const p of packages) {
      const entry = lock.packages[`node_modules/${p.name}`];
      assert.equal(entry.integrity, p.integrity);
      assert.equal(new URL(entry.resolved).host, "npm.pkg.github.com");
    }
  }
  console.log(
    `${remote ? "Registry" : "Local"} GitHub package install, strict types, ESM, CSS and peers passed`,
  );
}

if (process.argv.includes("--publish")) {
  assert.equal(
    process.env.GITHUB_ACTIONS,
    "true",
    "Publish only through the manual workflow",
  );
  assert.equal(process.env.GITHUB_REPOSITORY, "Alanshown/Animatter.js");
  assert.equal(process.env.GITHUB_REF, "refs/heads/main");
  assert.equal(process.env.EXPECTED_VERSION, version);
  const packages = JSON.parse(
    await readFile(`${output}/manifest.json`, "utf8"),
  );
  for (const [i, p] of packages.entries()) {
    assert.equal(p.name, names[i]);
    assert.equal(p.version, version);
    let existing;
    try {
      existing = JSON.parse(
        npm([
          "view",
          `${p.name}@${version}`,
          "dist",
          "--json",
          `--registry=${registry}`,
        ]),
      );
    } catch (error) {
      // Never confuse an authentication/network failure with an unused version.
      if (!String(error.stderr).includes("E404")) throw error;
    }
    if (existing) {
      assert.equal(
        existing.integrity,
        p.integrity,
        `${p.name} already exists with different content`,
      );
      console.log(
        `${p.name}@${version} already published with matching integrity`,
      );
    } else {
      console.log(
        npm([
          "publish",
          resolve(output, p.filename),
          "--ignore-scripts",
          "--access=public",
          `--registry=${registry}`,
        ]).trim(),
      );
    }
    const dist = JSON.parse(
      npm([
        "view",
        `${p.name}@${version}`,
        "dist",
        "--json",
        `--registry=${registry}`,
      ]),
    );
    assert.equal(dist.integrity, p.integrity);
  }
  await verify(packages, true);
} else {
  assert.ok(!process.argv.includes("--registry"));
  await verify(await stage());
}
