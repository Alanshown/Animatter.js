import { readFile, stat, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname, sep } from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const root = resolve("."),
  readmes = ["README.md", "README.zh-CN.md"];
let links = 0;
for (const name of [
  ...readmes,
  "docs/API.md",
  "docs/ARCHITECTURE.md",
  "docs/CORE-ACCEPTANCE.md",
  "docs/VERIFICATION.md",
  "CONTRIBUTING.md",
  "ROADMAP.md",
]) {
  const text = await readFile(name, "utf8");
  for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
    const target = match[1];
    if (/^(https?:|#)/.test(target)) continue;
    const file = resolve(dirname(name), target.split("#")[0]);
    assert.ok(file === root || file.startsWith(root + sep));
    await stat(file);
    links++;
  }
}
for (const name of readmes) {
  const text = await readFile(name, "utf8");
  assert.equal((text.match(/!\[/g) ?? []).length, 6);
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
  }
  assert.equal((text.match(/^## /gm) ?? []).length, 11);
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
