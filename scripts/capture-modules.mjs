import { startServer, base, launchChromium } from "./browser-utils.mjs";

// Captures screenshots of the v0.3+ demos into demos/screenshots for visual review.
const stop = await startServer();
const browser = await launchChromium();
const shots = [
  { file: "liquid-dock-minimal.png", path: "/demos/liquid-dock/index.html", hover: '[data-dock-id="notes"]' },
  { file: "liquid-dock-glass.png", path: "/demos/liquid-dock/index.html", theme: "glass", hover: '[data-dock-id="music"]' },
  { file: "liquid-dock-organic-vertical.png", path: "/demos/liquid-dock/index.html", theme: "organic", vertical: true, hover: '[data-dock-id="maps"]' },
  { file: "kinetic-type.png", path: "/demos/kinetic-type/index.html", move: true },
  { file: "lab.png", path: "/demos/lab/index.html" },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  for (const shot of shots) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    await page.goto(base + shot.path);
    await page.waitForFunction(() => window.ready);
    if (shot.theme) await page.click(`[data-theme="${shot.theme}"]`);
    if (shot.vertical) await page.click("#orientation");
    if (shot.hover) {
      const box = await page.locator(shot.hover).boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await sleep(700);
    }
    if (shot.move) {
      const box = await page.locator("#title").boundingBox();
      for (let i = 0; i < 14; i++) {
        await page.mouse.move(box.x + 20 + i * 40, box.y + box.height / 2);
        await sleep(16);
      }
      await sleep(120);
    }
    await page.screenshot({ path: `demos/screenshots/${shot.file}`, fullPage: false });
    await page.close();
    console.log("saved", shot.file);
  }
} finally {
  await browser.close();
  stop();
}
