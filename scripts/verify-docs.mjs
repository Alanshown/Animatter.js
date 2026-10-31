import { readFile, stat, writeFile, mkdir, readdir } from "node:fs/promises";
import { resolve, dirname, sep } from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const root = resolve("."),
  readmes = ["README.md", "README.zh-CN.md"];
let links = 0;
const walk = async (dir) => {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) result.push(...(await walk(path)));
    else if (entry.name.endsWith(".md")) result.push(path);
  }
  return result;
};
const slug = (text) =>
  text
    .toLowerCase()
    .replace(/[`*]/g, "")
    .replace(/[^\p{L}\p{N}_\s-]/gu, "")
    .replace(/ /g, "-");
const headings = (text) =>
  [...text.matchAll(/^#{1,6} (.+)$/gm)].map((m) => slug(m[1]));
for (const name of [
  ...readmes,
  "CONTRIBUTING.md",
  "ROADMAP.md",
  "CHANGELOG.md",
  ...(await walk("docs")),
  ...(await walk("packages")),
]) {
  const text = (await readFile(name, "utf8")).replace(
    /```[^\n]*\n[\s\S]*?```/g,
    "",
  );
  const references = [
    ...[...text.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]),
    ...[...text.matchAll(/(?:src|srcset|href)="([^"]+)"/g)].map((m) => m[1]),
  ];
  for (const target of references) {
    if (/^(https?:|data:)/.test(target)) continue;
    const [relative, anchor] = target.split("#");
    const file = relative ? resolve(dirname(name), relative) : resolve(name);
    assert.ok(file === root || file.startsWith(root + sep));
    await stat(file);
    if (anchor && file.endsWith(".md")) {
      const body = await readFile(file, "utf8");
      assert.ok(
        headings(body).includes(decodeURIComponent(anchor)),
        `Missing anchor ${target} in ${name}`,
      );
    }
    links++;
  }
}
const contents = await Promise.all(
  readmes.map((name) => readFile(name, "utf8")),
);
const version = JSON.parse(await readFile("package.json", "utf8")).version;
const codes = (text) =>
  [...text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1]);
assert.deepEqual(
  codes(contents[0]),
  codes(contents[1]),
  "Bilingual code examples diverge",
);
const badges = (text) =>
  [...text.matchAll(/https:\/\/img.shields.io[^"\s]+/g)].map((m) => m[0]);
assert.deepEqual(badges(contents[0]), badges(contents[1]));
for (const text of contents) {
  assert.ok(text.includes("https://img.shields.io/npm/v/animatter?"));
  assert.equal((text.match(/^## /gm) ?? []).length, 16);
  for (const asset of ["logo.svg", "logo-light.svg", "logo-dark.svg"])
    assert.ok(text.includes(`docs/assets/branding/${asset}`));
  for (const slug of [
    "skeleton-pet",
    "liquid-world",
    "gravity-dashboard",
    "magnetic-interface",
    "physics-portfolio",
    "living-workspace",
  ]) {
    assert.ok(text.includes(`docs/assets/demos/${slug}.gif`));
    assert.ok(text.includes(`demos/${slug}/index.html`));
    const demo = await readFile(`demos/${slug}/index.html`, "utf8");
    assert.ok(demo.includes("/docs/assets/branding/favicon.svg"));
  }
  assert.equal((text.match(/!\[/g) ?? []).length, 6);
  const publication = JSON.parse(
    await readFile(
      "docs/testing/npm-publication/registry-results.json",
      "utf8",
    ),
  );
  assert.ok(
    publication.checks.publicRegistryInstall &&
      publication.checks.integrityMatchesReviewedTarballs &&
      publication.checks.latestTags,
  );
  for (const name of ["animatter", "@animatter/react", "@animatter/vue"]) {
    assert.ok(
      publication.packages.some(
        (p) =>
          p.name === name &&
          p.version === version &&
          p.distTags.latest === version,
      ),
    );
  }
}
const manifest = JSON.parse(
  await readFile("docs/assets/demos/manifest.json", "utf8"),
);
assert.equal(manifest.length, 6);
let total = 0;
for (const item of manifest) {
  const data = await readFile(item.gif);
  assert.ok(["GIF87a", "GIF89a"].includes(data.subarray(0, 6).toString()));
  assert.equal(data.readUInt16LE(6), 960);
  assert.equal(createHash("sha256").update(data).digest("hex"), item.sha256);
  assert.equal(data.byteLength, item.bytes);
  assert.ok(Number(item.nb_frames) > 20);
  assert.ok(Number(item.duration) > 2);
  const netscape = data.indexOf(Buffer.from("NETSCAPE2.0"));
  assert.ok(netscape > 0);
  assert.equal(data[netscape + 13], 0);
  assert.equal(data[netscape + 14], 0);
  const png = await readFile(`docs/assets/demos/${item.demo}.png`);
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  assert.ok(png.readUInt32BE(16) >= 1280);
  total += data.byteLength;
}
await mkdir("test-results", { recursive: true });
await writeFile(
  "test-results/docs-results.json",
  JSON.stringify(
    {
      localLinksChecked: links,
      readmes: 2,
      demos: 6,
      gifs: 6,
      gifBytes: total,
      sha256: "all matched",
      loop: "all infinite",
    },
    null,
    2,
  ),
);
console.log(
  `Verified ${links} local documentation links, bilingual README structure, 6 PNGs and 6 looping GIFs (${total} bytes).`,
);
