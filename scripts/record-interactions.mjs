import { mkdir, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { startServer, base, launchChromium } from "./browser-utils.mjs";

// Records short interaction clips from the demos as looping GIFs.
// Frames are taken with Playwright screenshots (about 10 per second) and encoded by ffmpeg with a
// per-clip palette. Requires ffmpeg on PATH (or set FFMPEG=/path/to/ffmpeg).
const ffmpeg = process.env.FFMPEG || "ffmpeg";
const outDir = resolve("docs/assets/interactions");
const workRoot = resolve("test-results/gif-frames");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const clips = [
  {
    name: "liquid-dock",
    path: "/demos/liquid-dock/index.html",
    clip: { x: 260, y: 200, width: 760, height: 150 },
    async run(page, shot) {
      const box = await page.locator('[data-dock-id="maps"]').boundingBox();
      const y = box.y + box.height / 2;
      for (let x = 300; x <= box.x + box.width; x += 16) {
        await page.mouse.move(x, y);
        await shot(1);
      }
      await page.mouse.move(640, 60);
      await shot(6);
    },
  },
  {
    name: "blob-nav",
    path: "/demos/blob-nav/index.html",
    clip: { x: 240, y: 70, width: 800, height: 110 },
    async run(page, shot) {
      await shot(4);
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press("ArrowRight");
        await shot(8);
      }
    },
  },
  {
    name: "liquid-button",
    path: "/demos/liquid-button/index.html",
    clip: { x: 340, y: 380, width: 600, height: 90 },
    async run(page, shot) {
      const box = await page.locator("#b2").boundingBox();
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.mouse.move(cx - 60, cy);
      await shot(2);
      for (let i = 0; i <= 12; i++) {
        await page.mouse.move(cx - 60 + i * 10, cy + Math.sin(i / 2) * 6);
        await shot(1);
      }
      await page.mouse.down();
      await shot(6);
      await page.mouse.up();
      await page.mouse.move(5, 5);
      await shot(10);
    },
  },
  {
    name: "kinetic-type",
    path: "/demos/kinetic-type/index.html",
    clip: { x: 40, y: 200, width: 1000, height: 230 },
    async run(page, shot) {
      const box = await page.locator("#title").boundingBox();
      for (let i = 0; i < 26; i++) {
        await page.mouse.move(box.x + 20 + i * 32, box.y + box.height / 2 + (i % 2) * 8);
        await shot(1);
      }
      await page.click('[data-mode="wave"]');
      await shot(16);
    },
  },
];

const stop = await startServer();
const browser = await launchChromium();
try {
  await mkdir(outDir, { recursive: true });
  for (const c of clips) {
    const dir = join(workRoot, c.name);
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    await page.goto(base + c.path);
    await page.waitForFunction(() => window.ready);
    await sleep(500);
    let index = 0;
    const shot = async (count) => {
      for (let i = 0; i < count; i++) {
        await page.screenshot({ path: join(dir, `f${String(index++).padStart(4, "0")}.png`), clip: c.clip });
        await sleep(90);
      }
    };
    await c.run(page, shot);
    await page.close();
    const out = join(outDir, `${c.name}.gif`);
    execFileSync(
      ffmpeg,
      [
        "-y",
        "-loglevel",
        "error",
        "-framerate",
        "10",
        "-i",
        join(dir, "f%04d.png"),
        "-vf",
        "scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer",
        "-loop",
        "0",
        out,
      ],
      { stdio: "inherit" },
    );
    console.log(`wrote ${out} from ${index} frames`);
  }
} finally {
  await browser.close();
  stop();
}
