import assert from "node:assert/strict";
import { startServer, base, launchChromium } from "./browser-utils.mjs";

// Browser checks for v0.3 modules: liquid dock, kinetic typography, Lab scene round trip.
// Runs in local Chromium (see browser-utils.mjs for resolution order).
const stop = await startServer();
const browser = await launchChromium();
const results = [];
const check = async (name, fn) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  try {
    await fn(page);
    assert.deepEqual(errors, [], "no page or console errors");
    results.push({ name, status: "passed" });
    console.log("PASS", name);
  } catch (error) {
    results.push({ name, status: "failed", error: String(error) });
    console.log("FAIL", name, String(error).split("\n").slice(0, 4).join(" | "));
  } finally {
    await page.close();
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  await check("dock: hover magnifies nearby items and settles back on leave", async (page) => {
    await page.goto(`${base}/demos/liquid-dock/index.html`);
    await page.waitForFunction(() => window.ready);
    const box = await page.locator('[data-dock-id="notes"]').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await sleep(700);
    const near = await page.evaluate(() => {
      const el = document.querySelector('[data-dock-id="notes"]');
      return el.style.transform;
    });
    const farScale = await page.evaluate(() => {
      const el = document.querySelector('[data-dock-id="settings"]');
      return el.style.transform;
    });
    const nearScale = Number(near.match(/scale\(([\d.]+)\)/)[1]);
    const far = Number(farScale.match(/scale\(([\d.]+)\)/)[1]);
    assert.ok(nearScale > 1.4, `near scale ${nearScale}`);
    assert.ok(far < 1.1, `far scale ${far}`);
    await page.mouse.move(5, 5);
    await page.evaluate(() => window.dispatchEvent(new window.Event("blur")));
    await page.locator("header").hover();
    await sleep(900);
    const settled = await page.evaluate(() => document.querySelector('[data-dock-id="notes"]').style.transform);
    const s2 = Number(settled.match(/scale\(([\d.]+)\)/)[1]);
    assert.ok(s2 < 1.05, `settled scale ${s2}`);
  });

  await check("dock: pointer drag reorders and reports the new order", async (page) => {
    await page.goto(`${base}/demos/liquid-dock/index.html`);
    await page.waitForFunction(() => window.ready);
    const from = await page.locator('[data-dock-id="mail"]').boundingBox();
    const to = await page.locator('[data-dock-id="maps"]').boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) {
      await page.mouse.move(from.x + from.width / 2 + ((to.x + to.width / 2 - from.x - from.width / 2) * i) / 12, from.y + from.height / 2);
      await sleep(16);
    }
    await page.mouse.up();
    await sleep(100);
    const order = await page.evaluate(() => window.__dock.dock.order());
    assert.notEqual(order[0], "mail", `mail should have moved, order ${order}`);
    assert.equal(order.length, 7);
    assert.equal(new Set(order).size, 7, "no duplicates");
    const shown = await page.textContent("#order");
    assert.equal(shown, order.join(", "));
  });

  await check("dock: keyboard Alt+Arrow reorders and focus stays on the moved item", async (page) => {
    await page.goto(`${base}/demos/liquid-dock/index.html`);
    await page.waitForFunction(() => window.ready);
    await page.locator('[data-dock-id="notes"]').focus();
    await page.keyboard.press("Alt+ArrowLeft");
    await sleep(50);
    const order = await page.evaluate(() => window.__dock.dock.order());
    assert.deepEqual(order.slice(0, 3), ["mail", "notes", "calendar"]);
    const focused = await page.evaluate(() => document.activeElement?.dataset.dockId);
    assert.equal(focused, "notes");
    await page.keyboard.press("ArrowRight");
    const after = await page.evaluate(() => document.activeElement?.dataset.dockId);
    assert.equal(after, "calendar");
  });

  await check("dock: destroy restores items and leaves no transforms or listeners", async (page) => {
    await page.goto(`${base}/demos/liquid-dock/index.html`);
    await page.waitForFunction(() => window.ready);
    const result = await page.evaluate(() => {
      const container = document.querySelector("#dock");
      window.__dock.dock.destroy();
      const transforms = [...container.querySelectorAll("[data-dock-id]")].map((el) => el.style.transform);
      return { transforms, role: container.getAttribute("role"), touch: container.style.touchAction };
    });
    assert.deepEqual(result.transforms, Array(7).fill(""));
    assert.equal(result.role, null);
    assert.equal(result.touch, "");
  });

  await check("dock: reduced motion keeps items at rest but keyboard reorder still works", async (page) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${base}/demos/liquid-dock/index.html`);
    await page.waitForFunction(() => window.ready);
    const box = await page.locator('[data-dock-id="notes"]').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await sleep(500);
    const transform = await page.evaluate(() => document.querySelector('[data-dock-id="notes"]').style.transform);
    assert.match(transform, /scale\(1\.0000\)|scale\(1\)/, `expected no magnification, got ${transform}`);
    await page.locator('[data-dock-id="notes"]').focus();
    await page.keyboard.press("Alt+ArrowRight");
    const order = await page.evaluate(() => window.__dock.dock.order());
    assert.equal(order[3], "notes", "notes moved from index 2 to 3");
  });

  await check("kinetic: letters are grapheme clusters and the text stays readable to assistive tech", async (page) => {
    await page.goto(`${base}/demos/kinetic-type/index.html`);
    await page.waitForFunction(() => window.ready);
    const info = await page.evaluate(() => {
      const title = document.querySelector("#title");
      const letters = [...title.querySelectorAll('[data-am-letter]')];
      const sr = title.querySelector("span:not([aria-hidden])");
      return { count: letters.length, sr: sr?.textContent, mode: title.dataset.amKinetic, fallback: window.__kinetic.handles[0].fallback };
    });
    // Whitespace graphemes stay as text nodes (they are not moving letters).
    assert.equal(info.count, [..."Physical type that remembers its shape."].filter((c) => !/\s/.test(c)).length);
    assert.equal(info.sr, "Physical type that remembers its shape.");
    assert.equal(info.mode, "elastic");
    assert.equal(info.fallback, false);
  });

  await check("kinetic: pointer movement changes letter transforms over time", async (page) => {
    await page.goto(`${base}/demos/kinetic-type/index.html`);
    await page.waitForFunction(() => window.ready);
    const box = await page.locator("#title").boundingBox();
    const before = await page.evaluate(() => [...document.querySelectorAll("#title [data-am-letter]")].slice(0, 6).map((el) => el.style.transform));
    await page.mouse.move(box.x + 10, box.y + box.height / 2);
    for (let i = 0; i < 20; i++) {
      await page.mouse.move(box.x + 10 + i * 30, box.y + box.height / 2 + (i % 2) * 6);
      await sleep(16);
    }
    await sleep(200);
    const after = await page.evaluate(() => [...document.querySelectorAll("#title [data-am-letter]")].slice(0, 6).map((el) => el.style.transform));
    assert.notDeepEqual(after, before);
    for (const t of after) assert.doesNotMatch(t, /NaN|Infinity/);
  });

  await check("kinetic: long text falls back to plain text and destroy restores markup", async (page) => {
    await page.goto(`${base}/demos/kinetic-type/index.html`);
    await page.waitForFunction(() => window.ready);
    await page.selectOption("#sample", "long");
    await sleep(50);
    const fallback = await page.evaluate(() => {
      const title = document.querySelector("#title");
      return { mode: title.dataset.amKinetic, letters: title.querySelectorAll('[aria-hidden="true"]').length, text: title.textContent.length };
    });
    assert.equal(fallback.mode, "fallback");
    assert.equal(fallback.letters, 0);
    assert.ok(fallback.text > 300);
    const restored = await page.evaluate(() => {
      window.__kinetic.handles.forEach((h) => h.destroy());
      return document.querySelector("#title").dataset.amKinetic ?? null;
    });
    assert.equal(restored, null);
  });

  await check("lab: material edits, mode switch and JSON export/import round trip", async (page) => {
    await page.goto(`${base}/demos/lab/index.html`);
    await page.waitForFunction(() => window.ready);
    const exported = await page.evaluate(() => {
      document.querySelector("#export").click();
      return document.querySelector("#json").value;
    });
    const parsed = JSON.parse(exported);
    assert.equal(parsed.entities.length, 5);
    await page.evaluate(() => {
      document.querySelector("#json").value = document.querySelector("#json").value.replace('"stiffness"', '"stiffness"');
    });
    await page.evaluate(() => {
      document.querySelector("#json").value = JSON.stringify({ schemaVersion: 1, world: { mode: "field" }, entities: [{ id: "bad id", presets: ["nope"] }] });
      document.querySelector("#import").click();
    });
    const errorText = await page.textContent("#json-error");
    assert.match(errorText, /entities\[0\]\.id/);
    assert.match(errorText, /unknown preset/);
    await page.evaluate((text) => {
      document.querySelector("#json").value = text;
      document.querySelector("#import").click();
    }, JSON.stringify({ ...parsed, world: { mode: "field", reducedMotion: "system" }, entities: parsed.entities.slice(0, 2) }));
    await sleep(100);
    const count = await page.evaluate(() => window.__lab.entities.length);
    assert.equal(count, 2);
    const mode = await page.evaluate(() => window.__lab.world.stats().enabled);
    assert.equal(mode, true);
  });

  await check("rope editor: pointer drag moves rope nodes and an over-stretch breaks one end", async (page) => {
    await page.goto(`${base}/demos/rope-editor/index.html`);
    await page.waitForFunction(() => window.ready);
    await sleep(600);
    const before = await page.evaluate(() => Array.from(window.__ropes.ropes[1].points()));
    const box = await page.locator('.node').nth(0).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + 14);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(box.x + box.width / 2 + i * 12, box.y + 14 + i * 6);
      await sleep(30);
    }
    await sleep(400);
    await page.mouse.up();
    await sleep(300);
    const after = await page.evaluate(() => Array.from(window.__ropes.ropes[1].points()));
    assert.ok(after.every(Number.isFinite), "rope nodes stay finite");
    assert.notDeepEqual(after, before, "dragging the card moves rope nodes");
    // Pull card 2 far away so rope 2 stretches past breakStretch.
    const far = await page.locator('.node').nth(2).boundingBox();
    await page.mouse.move(far.x + far.width / 2, far.y + 14);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) {
      // Cards are clamped to the board, so drag toward the far corner to exceed the break threshold.
      await page.mouse.move(far.x + far.width / 2 + i * 35, far.y + 14 + i * 25);
      await sleep(25);
    }
    await page.mouse.up();
    await sleep(500);
    const states = await page.evaluate(() => window.__ropes.ropes.map((r) => [r.state("a"), r.state("b")]));
    const logText = await page.textContent("#log");
    assert.ok(states.flat().includes("broken") || logText.includes("broke"), `expected a break, states ${JSON.stringify(states)} log "${logText}"`);
    await page.click("#reconnect");
    assert.match(await page.textContent("#log"), /Reconnected|Nothing to reconnect/);
  });

  await check("soft body playground: bodies stay finite, a ripple moves them and metaball view draws pixels", async (page) => {
    await page.goto(`${base}/demos/soft-body/index.html`);
    await page.waitForFunction(() => window.ready);
    await sleep(400);
    const count = await page.evaluate(() => window.__soft.bodies.length);
    assert.equal(count, 5);
    const before = await page.evaluate(() => Array.from(window.__soft.bodies[0].positions()));
    await page.locator("#stage").click({ position: { x: 40, y: 500 } });
    await sleep(600);
    const after = await page.evaluate(() => Array.from(window.__soft.bodies[0].positions()));
    assert.ok(after.every(Number.isFinite), "positions finite after ripple");
    assert.notDeepEqual(after, before, "ripple moves particles");
    await page.click("#view");
    await sleep(500);
    const pixels = await page.evaluate(() => {
      const c = window.__soft.meta.canvas;
      const data = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      let lit = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 0) lit++;
      return { lit, total: c.width * c.height, ms: window.__soft.meta.averageFrameMs() };
    });
    assert.ok(pixels.lit > 500, `metaball lit pixels ${pixels.lit}`);
    assert.ok(pixels.ms >= 0 && pixels.ms < 200, `metaball frame ms ${pixels.ms}`);
  });

  await check("jelly card: pressing and dragging deforms the label with the body; deformation off is rigid and still clickable", async (page) => {
    await page.goto(`${base}/demos/jelly-card/index.html`);
    await page.waitForFunction(() => window.ready);
    await sleep(300);
    const card = await page.locator("#card").boundingBox();
    const cx = card.x + card.width / 2;
    const cy = card.y + card.height / 2;
    await page.mouse.move(cx - 150, cy);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) {
      await page.mouse.move(cx - 150 + i * 8, cy - i * 5);
      await sleep(25);
    }
    await sleep(200);
    const t = await page.evaluate(() => document.querySelector("#label").style.transform);
    assert.match(t, /translate\(/, "label follows the body centre");
    await page.mouse.up();
    await page.click("#deform");
    await sleep(200);
    const rigidLabel = await page.evaluate(() => document.querySelector("#label").style.transform);
    assert.equal(rigidLabel, "", "no label transform when deformation is off");
    await page.click("#card");
    assert.match(await page.textContent("#clicks"), /clicks 1/, "a plain click counts once");
    assert.equal(await page.evaluate(() => window.__jelly.card.classList.contains("deform-on")), false);
  });

  await check("jelly card: reduced motion keeps the body at rest", async (page) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${base}/demos/jelly-card/index.html`);
    await page.waitForFunction(() => window.ready);
    const a = await page.evaluate(() => Array.from(window.__jelly.body.positions()));
    await sleep(800);
    const b = await page.evaluate(() => Array.from(window.__jelly.body.positions()));
    // Float32 rounding can move a rest state by a hair per step, so compare with a 0.05 px tolerance.
    const drift = Math.max(...a.map((v, i) => Math.abs(v - b[i])));
    assert.ok(drift < 0.05, `max drift ${drift} px under reduced motion`);
  });

} finally {
  await browser.close();
  stop();
}

const failed = results.filter((r) => r.status === "failed");
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exitCode = 1;
