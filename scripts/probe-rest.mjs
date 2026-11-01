import { chromium } from "@playwright/test";
import { startServer, base } from "./browser-utils.mjs";

const stop = await startServer();
const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${base}/demos/presets-studio/index.html`);
  await page.waitForFunction(() => window.__studio);
  await page.waitForTimeout(1500);
  const overflow = await page.evaluate(() =>
    [...document.querySelectorAll(".tile")].map((t) => ({
      text: t.textContent, scrollW: t.scrollWidth, clientW: t.clientWidth, scrollH: t.scrollHeight, clientH: t.clientHeight,
    })),
  );
  console.log(JSON.stringify(overflow, null, 1));
  await page.locator("section.declared").screenshot({ path: "demos/screenshots/presets-studio-declared.png" });
} finally {
  await browser.close();
  stop();
}
