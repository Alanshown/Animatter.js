import { mkdir, writeFile, stat, rename } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { startServer, base, launchChromium } from "./browser-utils.mjs";
import { demos } from "./demo-tests.mjs";
const stop = await startServer(),
  browser = await launchChromium();
await mkdir("artifacts/videos", { recursive: true });
await mkdir("artifacts/gifs", { recursive: true });
await mkdir("docs/assets/demos", { recursive: true });
const manifest = [];
const pause = (p, ms = 650) => p.waitForTimeout(ms);
async function drag(p, selector, dx, dy) {
  const el = p.locator(selector),
    r = await el.boundingBox();
  await p.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await p.mouse.down();
  await p.mouse.move(r.x + r.width / 2 + dx, r.y + r.height / 2 + dy, {
    steps: 20,
  });
  await pause(p, 180);
  await p.mouse.up();
  await pause(p, 850);
}
try {
  for (const name of demos) {
    const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        recordVideo: {
          dir: "artifacts/videos",
          size: { width: 1280, height: 900 },
        },
      }),
      page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.setDefaultTimeout(10000);
    await page.goto(`${base}/demos/${name}/index.html`);
    await page.waitForFunction(() => window.demoReady);
    await pause(page, 500);
    if (name === "skeleton-pet") {
      await page.locator('[data-am="fern"]').hover();
      await page.waitForFunction(
        () =>
          !document
            .querySelector('[data-am="fern"]')
            .classList.contains("sleeping"),
      );
      await pause(page, 450);
      await page.locator('[data-am="quote"]').hover();
      await page.waitForFunction(
        () =>
          !document
            .querySelector('[data-am="quote"]')
            .classList.contains("sleeping"),
      );
      await pause(page, 450);
      await drag(page, ".am-actor", -130, 100);
      await page.locator('[data-am="landscape"]').hover();
      await page.waitForFunction(
        () =>
          !document
            .querySelector('[data-am="landscape"]')
            .classList.contains("sleeping"),
      );
      await pause(page, 800);
    } else if (name === "liquid-world") {
      await page.locator("#breathe").click();
      await pause(page, 700);
      await drag(page, '[data-am="orb"]', -65, 40);
      await page.locator("#flow-info").hover();
      await pause(page, 850);
      await page.locator("#filter").click();
      await pause(page, 600);
      await page.locator('[data-material="elastic"]').click();
      await pause(page, 500);
      await page.locator("#about").click();
      await pause(page, 1000);
      await page.keyboard.press("Escape");
      await pause(page, 700);
    } else if (name === "gravity-dashboard") {
      await drag(page, '[data-am="revenue"]', 350, 0);
      await pause(page, 700);
      await page.locator('[data-am="focus"] [data-up]').click();
      await pause(page, 900);
      await page.locator("#refresh").click();
      await pause(page, 1100);
      await page.locator("summary").first().click();
      await pause(page, 900);
    } else if (name === "magnetic-interface") {
      for (const point of [
        [850, 240],
        [1080, 340],
        [940, 430],
        [820, 350],
      ]) {
        await page.mouse.move(...point, { steps: 18 });
        await pause(page, 400);
      }
      await page.locator('[data-am="node-a"]').click();
      await page.locator('[data-am="node-b"]').click();
      await pause(page, 700);
      await page.locator('[data-field="repel"]').click();
      await page.mouse.move(980, 330, { steps: 18 });
      await pause(page, 800);
      await page.locator('[data-field="orbit"]').click();
      await page.mouse.move(940, 355, { steps: 18 });
      await pause(page, 1400);
    } else if (name === "physics-portfolio") {
      await page.locator('[data-am="feel"]').hover();
      await pause(page, 800);
      await page.mouse.move(15, 15);
      await page.mouse.wheel(0, 300);
      await pause(page, 700);
      await page.locator('[data-project="forma"]').hover();
      await pause(page, 500);
      await page.locator('[data-project="forma"]').click();
      await pause(page, 1000);
      await page.keyboard.press("Escape");
      await page.mouse.wheel(0, 530);
      await pause(page, 800);
      await page.locator("#contact-bottom").click();
      await pause(page, 800);
      await page.keyboard.press("Escape");
    } else if (name === "living-workspace") {
      await page.locator('[data-am="task-motion"]').hover();
      await pause(page, 900);
      await page.locator('[data-am="task-motion"] [data-run]').click();
      await page.waitForFunction(() =>
        document.querySelector('#done-tasks [data-am="task-motion"]'),
      );
      await pause(page, 1000);
      await page.locator("#dismiss-notification").click();
      await page.locator("#call-pip").click();
      await pause(page, 1100);
      await page.locator('[data-am="task-framework"] [data-run]').click();
      await page.waitForFunction(() =>
        document.querySelector('#done-tasks [data-am="task-framework"]'),
      );
      await pause(page, 1200);
    }
    await page.mouse.move(15, 15);
    await pause(page, 500);
    if (errors.length) throw Error(`${name}: ${errors.join(";")}`);
    const source = await page.video().path();
    await page.screenshot({ path: `docs/assets/demos/${name}.png` });
    await context.close();
    const output = `docs/assets/demos/${name}.gif`,temporary=`artifacts/gifs/${name}.gif`;
    execFileSync(
      "ffmpeg",
      [
        "-v",
        "error",
        "-y",
        "-ss",
        "0.45",
        "-i",
        source,
        "-filter_complex_threads",
        "1",
        "-filter_complex",
        "[0:v]fps=8,scale=960:-1:flags=lanczos,hqdn3d=2:1.5:3:2.5,split[a][b];[a]palettegen=max_colors=96:stats_mode=full[p];[b][p]paletteuse=dither=none:diff_mode=rectangle",
        "-loop",
        "0",
        temporary,
      ],
      { stdio: "pipe" },
    );
    await rename(temporary,output);
    const probe = JSON.parse(
      execFileSync(
        "ffprobe",
        [
          "-v",
          "error",
          "-select_streams",
          "v:0",
          "-show_entries",
          "stream=width,height,nb_frames,duration",
          "-of",
          "json",
          output,
        ],
        { encoding: "utf8" },
      ),
    );
    manifest.push({
      demo: name,
      browser: browser.version(),
      url: `/demos/${name}/index.html`,
      capturedAt: new Date().toISOString(),
      method:
        "Actual Playwright video recording; ffmpeg palette GIF conversion; no generated or simulated screenshot frames",
      leadingTrimSeconds: 0.45,
      sourceVideoSha256: createHash("sha256")
        .update(await readFile(source))
        .digest("hex"),
      gif: output,
      bytes: (await stat(output)).size,
      sha256: createHash("sha256")
        .update(await readFile(output))
        .digest("hex"),
      ...probe.streams[0],
    });
    console.log(
      "CAPTURED",
      name,
      manifest.at(-1).bytes,
      manifest.at(-1).duration,
    );
    await writeFile(
      "docs/assets/demos/manifest.json",
      JSON.stringify(manifest, null, 2),
    );
  }
} finally {
  await browser.close();
  stop();
}
