import { launchChromium } from "./browser-utils.mjs";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const dir = "docs/assets/branding";
const files = await readdir(dir);
for (const name of [
  "logo.svg",
  "logo-dark.svg",
  "logo-light.svg",
  "symbol.svg",
  "wordmark.svg",
  "banner.svg",
  "favicon.svg",
  "icon-192.png",
  "icon-512.png",
  "BRANDING.md",
])
  assert.ok(files.includes(name));
const svgs = await Promise.all(
  files
    .filter((f) => f.endsWith(".svg"))
    .map(async (name) => ({
      name,
      text: await readFile(`${dir}/${name}`, "utf8"),
    })),
);
const browser = await launchChromium();
const report = {
  checkedAt: new Date().toISOString(),
  browser: browser.version(),
  svgs: [],
  pngs: [],
  symbolSizes: [24, 32, 64],
};
try {
  const page = await browser.newPage({
    viewport: { width: 1000, height: 850 },
    deviceScaleFactor: 1,
  });
  for (const { name, text } of svgs) {
    const result = await page.evaluate((text) => {
      const doc = new window.DOMParser().parseFromString(text, "image/svg+xml");
      return {
        valid: !doc.querySelector("parsererror"),
        viewBox: doc.documentElement.getAttribute("viewBox"),
        paths: doc.querySelectorAll("path").length,
        unsafe: !!doc.querySelector("script,foreignObject,image,text,use"),
        external: [...doc.querySelectorAll("*")].some((el) =>
          [...el.attributes].some(
            (a) => /^on|href$/i.test(a.name) || /url\(/.test(a.value),
          ),
        ),
      };
    }, text);
    assert.ok(
      result.valid &&
        result.viewBox &&
        result.paths &&
        !result.unsafe &&
        !result.external,
      `Invalid or external SVG ${name}`,
    );
    report.svgs.push({ name, ...result });
  }
  for (const size of [192, 512]) {
    const data = await readFile(`${dir}/icon-${size}.png`);
    assert.equal(data.readUInt32BE(16), size);
    assert.equal(data.readUInt32BE(20), size);
    const pixels = await page.evaluate(
      async (uri) => {
        const img = new window.Image();
        img.src = uri;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const rgba = ctx.getImageData(0, 0, img.width, img.height).data;
        let transparent = 0,
          opaque = 0,
          partial = 0;
        for (let i = 3; i < rgba.length; i += 4) {
          if (rgba[i] === 0) transparent++;
          else if (rgba[i] === 255) opaque++;
          else partial++;
        }
        return { transparent, opaque, partial };
      },
      `data:image/png;base64,${data.toString("base64")}`,
    );
    assert.ok(
      pixels.transparent > (size * size) / 2 &&
        pixels.opaque > 0 &&
        pixels.partial > 0,
    );
    report.pngs.push({ size, ...pixels });
  }
  const uri = (name) =>
    `data:image/svg+xml;base64,${Buffer.from(svgs.find((x) => x.name === name).text).toString("base64")}`;
  const darkSymbol = `data:image/svg+xml;base64,${Buffer.from(svgs.find((x) => x.name === "symbol.svg").text.replaceAll("#087f83", "#70d1c7")).toString("base64")}`;
  const themes = ["light", "dark"].map((theme) => {
    const symbol = theme === "light" ? uri("symbol.svg") : darkSymbol;
    return `<section style="background:${theme === "light" ? "#fff" : "#142c32"};color:${theme === "light" ? "#142c32" : "#edf4ef"};padding:28px"><p>${theme} background · original vector paths</p><img src="${uri(`logo-${theme}.svg`)}" width="390" height="88"><div style="display:flex;align-items:center;gap:32px">${[24, 32, 64].map((size) => `<div><img src="${symbol}" width="${size}" height="${size}"><p>${size} px</p></div>`).join("")}</div></section>`;
  });
  await page.setContent(
    `<html><body style="margin:0;font:14px system-ui">${themes.join("")}<img src="${uri("banner.svg")}" width="1000"></body></html>`,
  );
  await page
    .locator("img")
    .evaluateAll((imgs) => Promise.all(imgs.map((img) => img.decode())));
  await mkdir("artifacts/branding", { recursive: true });
  await page.screenshot({
    path: "artifacts/branding/brand-review.png",
    fullPage: true,
  });
} finally {
  await browser.close();
}
await mkdir("test-results", { recursive: true });
await writeFile(
  "test-results/branding-results.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  `Validated ${report.svgs.length} path-based SVGs, 24/32/64 previews, and transparent 192/512 PNGs.`,
);
