import { mkdir, writeFile } from "node:fs/promises";
import { startServer, base, launchChromium } from "./browser-utils.mjs";

// Measured timings for v0.4 and v0.5 modules. Node numbers are CPU-only solver costs.
// Browser numbers come from local Chromium, which may use software WebGL (SwiftShader) on this machine.
const results = { node: {}, browser: {}, environment: { node: process.version, platform: process.platform } };

async function timeNode(label, iterations, fn) {
  for (let i = 0; i < 50; i++) fn(); // warm-up
  const t0 = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const ms = (performance.now() - t0) / iterations;
  results.node[label] = { msPerCall: Number(ms.toFixed(4)) };
  console.log(label.padEnd(44), ms.toFixed(4), "ms/call");
}

const { RopeSolver } = await import("../packages/core/src/rope/solver.ts");
const { ParticleSim } = await import("../packages/core/src/particles/sim.ts");
const { createSoftBody, linkSoftBodyContacts } = await import("../packages/core/src/softbody/body.ts");
const { evaluateField } = await import("../packages/core/src/renderers/metaball.ts");

for (const segments of [18, 64, 200]) {
  const rope = new RopeSolver({ x: 0, y: 0 }, { x: 300, y: 0 }, { segments, length: 300, gravity: { x: 0, y: 900 }, iterations: 8 });
  rope.pin(0, 0, 0);
  rope.pin(segments, 300, 0);
  await timeNode(`rope step, ${segments} segments, 8 iterations (1/60 s)`, 2000, () => rope.step(1 / 60));
}

{
  const systems = [];
  const world = { attach: (s) => (systems.push(s), () => {}) };
  const bodies = [];
  for (let i = 0; i < 5; i++) bodies.push(createSoftBody(world, { points: 18, radius: 50, center: { x: 100 + i * 150, y: 200 }, pressure: 0.8 }));
  linkSoftBodyContacts(world, bodies, { particleRadius: 9 });
  const frame = () => {
    for (const s of systems) s.frame?.(1 / 60);
    for (let k = 0; k < 2; k++) for (const s of systems) s.fixedStep?.(1 / 120);
  };
  await timeNode("soft bodies: 5x18 + contacts, 1/60 s frame", 1000, frame);
}

for (const count of [10000, 50000]) {
  const sim = new ParticleSim(count, 1200, 600, 7);
  sim.setField({ kind: "attract", x: 600, y: 300, strength: 300, radius: 400 }, 0);
  await timeNode(`particles CPU step, ${count} particles (1/60 s)`, count >= 50000 ? 100 : 400, () => sim.step(1 / 60));
}

{
  const blobs = [];
  for (let b = 0; b < 5; b++) for (let i = 0; i < 19; i++) blobs.push({ x: 300 + b * 150 + Math.cos(i) * 40, y: 250 + Math.sin(i) * 40, r: i === 18 ? 26 : 14 });
  for (const cell of [2, 3, 4]) {
    const w = Math.ceil(1234 / cell);
    const h = Math.ceil(560 / cell);
    const field = new Float32Array(w * h);
    await timeNode(`metaball field, 95 blobs, cell ${cell}px (${w}x${h})`, 200, () => evaluateField(blobs, w, h, cell, field));
  }
}

const stop = await startServer();
const browser = await launchChromium();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  await page.goto(`${base}/demos/particles/index.html`);
  await page.waitForFunction(() => window.ready);
  for (const [count, renderer] of [
    ["10000", "webgl2"],
    ["50000", "webgl2"],
    ["10000", "canvas2d"],
  ]) {
    await page.selectOption("#count", count);
    if ((await page.evaluate(() => window.__particles.system.rendererKind)) !== renderer) {
      await page.evaluate((r) => {
        window.__particles.preferred = r;
        window.__particles.build();
      }, renderer);
    }
    await new Promise((r) => setTimeout(r, 2500));
    const stats = await page.evaluate(() => ({ kind: window.__particles.system.rendererKind, ...window.__particles.system.stats() }));
    const key = `particles ${count} ${stats.kind}`;
    results.browser[key] = { frameMs: Number(stats.frameMs.toFixed(3)), alive: stats.alive };
    console.log(key.padEnd(44), "sim+draw", stats.frameMs.toFixed(3), "ms/frame (last 60)");
  }
  await page.goto(`${base}/demos/soft-body/index.html`);
  await page.waitForFunction(() => window.ready);
  await page.click("#view");
  await new Promise((r) => setTimeout(r, 2500));
  const meta = await page.evaluate(() => ({ ms: window.__soft.meta.averageFrameMs(), cells: window.__soft.meta.cellCount() }));
  results.browser["metaball soft-body playground (5 bodies, cell 3)"] = { frameMs: Number(meta.ms.toFixed(3)), cells: meta.cells };
  console.log("metaball soft-body playground".padEnd(44), "field+draw", meta.ms.toFixed(3), "ms/frame,", meta.cells, "cells");
  // Same scene on the WebGL2 fragment-shader renderer (full device resolution).
  await page.evaluate(() => window.__soft.setRenderer("webgl2"));
  await new Promise((r) => setTimeout(r, 2500));
  const gl = await page.evaluate(() => ({ ms: window.__soft.meta.averageFrameMs(), px: window.__soft.meta.cellCount() }));
  results.browser["metaball GL soft-body playground (5 bodies, full res, synced)"] = { frameMs: Number(gl.ms.toFixed(3)), pixels: gl.px };
  console.log("metaball GL soft-body playground".padEnd(44), "shader draw, GPU-synced sample (every 30th frame)", gl.ms.toFixed(3), "ms/frame,", gl.px, "device px");
} finally {
  await browser.close();
  stop();
}

await mkdir("test-results", { recursive: true });
await writeFile("test-results/benchmark-modules.json", JSON.stringify(results, null, 2));
console.log("\nwrote test-results/benchmark-modules.json");
