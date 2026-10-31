import assert from "node:assert/strict";
import { base } from "./browser-utils.mjs";
export async function measureRuntime(browser, engine, report) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.goto(base + "/tests/fixtures/runtime.html");
  await page.waitForFunction(() => window.ready);
  for (const count of [100, 300]) {
    const result = await page.evaluate(async (count) => {
      window.world.destroy();
      const root = document.createElement("div");
      root.style.cssText = "position:relative;width:1300px;height:850px";
      document.body.prepend(root);
      const w = window.am.createWorld({
        root,
        autoStart: false,
        mode: "field",
        reducedMotion: "never",
      });
      for (let i = 0; i < count; i++) {
        const el = document.createElement("button");
        el.textContent = String(i);
        el.style.cssText = `position:absolute;width:35px;height:24px;left:${(i % 25) * 50}px;top:${Math.floor(i / 25) * 45}px;margin:0`;
        root.append(el);
        w.register(el, { id: "bench-" + i });
      }
      const steps = [],
        intervals = [];
      let previous = 0;
      for (let i = 0; i < 150; i++)
        await new Promise((resolve) =>
          requestAnimationFrame((time) => {
            w.input.pointer.active = true;
            w.input.pointer.point = window.am.vec(
              300 + Math.sin(i * 0.1) * 240,
              250 + Math.cos(i * 0.08) * 150,
            );
            const start = performance.now();
            w.step(previous ? (time - previous) / 1000 : 1 / 60);
            if (i >= 30) {
              steps.push(performance.now() - start);
              intervals.push(time - previous);
            }
            previous = time;
            resolve();
          }),
        );
      const percentile = (values, p) =>
        [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * p)];
      const result = {
        surfaces: count,
        samples: steps.length,
        stepMedianMs: percentile(steps, 0.5),
        stepP95Ms: percentile(steps, 0.95),
        frameIntervalMedianMs: percentile(intervals, 0.5),
        frameIntervalP95Ms: percentile(intervals, 0.95),
      };
      w.destroy();
      root.remove();
      return result;
    }, count);
    report.performance.push({ browser: engine, ...result });
    console.log("MEASURE", engine, JSON.stringify(result));
  }
  if (engine === "chromium") {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    const cycle = () =>
      page.evaluate(() => {
        for (let i = 0; i < 30; i++) {
          const w = window.am.createWorld({ autoStart: false });
          w.register(document.querySelector("#a"), { id: "cycle" });
          w.addActor("cycle", {
            renderer: new window.am.SVGActorRenderer(),
            draggable: true,
          });
          w.use(window.am.devtools());
          w.destroy();
        }
      });
    await cycle();
    await cdp.send("HeapProfiler.collectGarbage");
    const before = await cdp.send("Performance.getMetrics");
    await cycle();
    await cdp.send("HeapProfiler.collectGarbage");
    const after = await cdp.send("Performance.getMetrics");
    const selected = (result) =>
      Object.fromEntries(
        result.metrics
          .filter((m) =>
            [
              "JSHeapUsedSize",
              "Nodes",
              "JSEventListeners",
              "Documents",
            ].includes(m.name),
          )
          .map((m) => [m.name, m.value]),
      );
    const a = selected(before),
      b = selected(after);
    report.memory = {
      method:
        "Chromium CDP metrics after warmup and full GC; 30 additional mount/destroy cycles, one surface, draggable actor, devtools per cycle. Heap values are observations, not proof of zero leakage.",
      before: a,
      after: b,
      delta: Object.fromEntries(Object.keys(a).map((k) => [k, b[k] - a[k]])),
    };
    assert.ok(
      b.JSEventListeners <= a.JSEventListeners + 1,
      "listener growth after GC",
    );
    assert.ok(b.Nodes <= a.Nodes + 10, "DOM node growth after GC");
    await cdp.detach();
  }
  await page.close();
}
