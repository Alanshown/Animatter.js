import { mkdir } from "node:fs/promises";
import { startServer, base, launchChromium } from "./browser-utils.mjs";


const stop = await startServer();
const out = "artifacts/demo-screenshots";
await mkdir(out, { recursive: true });
const browser = await launchChromium();
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`);
  });
  await page.goto(`${base}/demos/presets-studio/index.html`);
  await page.waitForFunction(() => window.__studio);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/presets-studio-initial.png`, fullPage: false });

  // Drag the elastic card and capture the mid-drag frame.
  const elasticBox = await page.locator(".card").first().boundingBox();
  if (elasticBox) {
    const cx = elasticBox.x + elasticBox.width / 2;
    const cy = elasticBox.y + elasticBox.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 140, cy + 60, { steps: 14 });
    await page.waitForTimeout(120);
    await page.screenshot({ path: `${out}/presets-studio-dragging.png` });
    await page.mouse.up();
    await page.waitForTimeout(900);
  }

  // Strength slider to 2 (overshoot) and to 0 (no effect), checking the live material changes.
  await page.evaluate(() => window.__studio.applyStrength(2));
  await page.waitForTimeout(300);
  const strong = await page.evaluate(() => window.__studio.world.spatial.surfaces.get("card-elastic")?.options.material.stiffness ?? null);
  await page.evaluate(() => window.__studio.applyStrength(0));
  await page.waitForTimeout(300);
  const zero = await page.evaluate(() => window.__studio.world.spatial.surfaces.get("card-elastic")?.options.material.stiffness ?? null);
  await page.evaluate(() => window.__studio.applyStrength(1));
  results.push({ check: "strength 2 vs 0 changes live material", strong, zero, pass: strong !== zero });

  // Disable and enable through the toggle button.
  await page.click("#toggle");
  await page.waitForTimeout(150);
  const disabled = await page.evaluate(() => window.__studio.world.spatial.surfaces.get("card-snap")?.options.material.stiffness);
  await page.click("#toggle");
  await page.waitForTimeout(150);
  const enabled = await page.evaluate(() => window.__studio.world.spatial.surfaces.get("card-snap")?.options.material.stiffness);
  results.push({ check: "toggle restores snap baseline and reapplies", disabled, enabled, pass: disabled !== enabled });

  // Frame cost measured from the world stats over a short window.
  const before = await page.evaluate(() => window.__studio.stats());
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => window.__studio.stats());
  const frames = after.frames - before.frames;
  results.push({ check: "frame rate over 1.5 s", framesPerSecond: Math.round((frames / 1.5) * 10) / 10 });

  await page.screenshot({ path: `${out}/presets-studio-settled.png`, fullPage: true });
  results.push({ check: "console and page errors", count: errors.length, errors });
} finally {
  await browser.close();
  stop();
}
console.log(JSON.stringify(results, null, 2));
