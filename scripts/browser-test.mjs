import { chromium, firefox, webkit } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile, access } from "node:fs/promises";
import { base, startServer } from "./browser-utils.mjs";
const stop = await startServer();
await mkdir("test-results", { recursive: true });
const report = {
  date: new Date().toISOString(),
  environment: { node: process.version, platform: process.platform },
  cases: [],
  browsers: [],
  performance: [],
};
const coreOnly = process.argv.includes("--core");
const engines =
  process.argv.includes("--all") || process.env.ALL_BROWSERS === "1"
    ? [chromium, firefox, webkit]
    : [chromium];
let failed = false;
for (const engine of engines) {
  let browser;
  try {
    browser = await engine.launch({ headless: true, timeout: 15000 });
    report.browsers.push({ name: engine.name(), version: browser.version() });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const run = async (name, fn, options = {}) => {
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      try {
        page.setDefaultTimeout(12000);
        page.setDefaultNavigationTimeout(15000);
        await page.goto(base + "/tests/fixtures/runtime.html");
        await page.waitForFunction(() => window.ready);
        await fn(page);
        assert.deepEqual(errors, []);
        assert.deepEqual(await page.evaluate(() => window.errors), []);
        report.cases.push({
          browser: engine.name(),
          name,
          status: "passed",
          ...options,
        });
        console.log("PASS", engine.name(), name);
      } catch (error) {
        failed = true;
        report.cases.push({
          browser: engine.name(),
          name,
          status: "failed",
          error: String(error),
        });
        console.error("FAIL", name, error);
        await page.screenshot({
          path: `test-results/failure-${engine.name()}-${name}.png`,
        });
      } finally {
        await page.close();
      }
    };
    await run("native-click-focus-input", async (p) => {
      await p.locator("#a").click();
      await p.locator("#input").fill("Alan");
      await p.locator("#b").focus();
      assert.equal(await p.evaluate(() => window.nativeClicks), 1);
      assert.ok(
        await p.evaluate(
          () =>
            events.some((e) => e.type === "focus" && e.target === "b") &&
            events.some((e) => e.type === "input" && e.target === "input"),
        ),
      );
    });
    await run("field-force-and-mode-switch", async (p) => {
      await p.mouse.move(235, 160);
      await p.waitForTimeout(220);
      assert.ok(
        await p.evaluate(
          () => Math.abs(world.physics.bodies.get("a").position.x) > 1,
        ),
      );
      await p.evaluate(() => world.setMode("embodied"));
      assert.equal(
        await p.locator("#a").evaluate((el) => el.style.translate),
        "2px 3px",
      );
      await p.evaluate(() => world.setMode("field"));
      await p.waitForTimeout(160);
      assert.notEqual(
        await p.locator("#a").evaluate((el) => el.style.translate),
        "2px 3px",
      );
      await p.evaluate(() => world.setEnabled(false));
      assert.equal(
        await p.locator("#a").evaluate((el) => el.style.translate),
        "2px 3px",
      );
      await p.locator("#a").click();
      assert.equal(await p.evaluate(() => nativeClicks), 1);
    });
    await run("drag-cancel-and-release", async (p) => {
      const b = await p.locator("#a").boundingBox();
      await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await p.mouse.down();
      await p.mouse.move(b.x + b.width / 2 + 85, b.y + b.height / 2 + 35, {
        steps: 6,
      });
      assert.ok(await p.evaluate(() => world.physics.bodies.get("a").pinned));
      await p.mouse.up();
      assert.equal(
        await p.evaluate(() => world.physics.bodies.get("a").pinned),
        false,
      );
      assert.ok(
        await p.evaluate(() => events.some((e) => e.type === "dragend")),
      );
      await p.locator("#a").dispatchEvent("pointerdown", {
        pointerId: 10,
        clientX: 140,
        clientY: 140,
        button: 0,
      });
      await p.locator("#a").dispatchEvent("pointermove", {
        pointerId: 10,
        clientX: 190,
        clientY: 170,
      });
      await p.locator("#a").dispatchEvent("pointercancel", { pointerId: 10 });
      assert.equal(
        await p.evaluate(() => world.physics.bodies.get("a").pinned),
        false,
      );
    });
    await run("actor-dynamic-target-and-interruption", async (p) => {
      const result = await p.evaluate(async () => {
        world.setMode("both");
        const actor = world.addActor("test", {
          renderer: new am.SVGActorRenderer(),
          idle: true,
          idleDelay: 10,
          reactTo: [],
        });
        const low = actor.moveTo("a", { priority: 10 });
        for (let i = 0; i < 20; i++) world.step(1 / 120);
        const high = actor.moveTo("b", { priority: 100 });
        for (let i = 0; i < 500; i++) world.step(1 / 120);
        return {
          high: await high,
          low: await low,
          pose: actor.pose.position,
          anchor: world.spatial.surfaces.get("a").anchors.top,
          tasks: world.arbiter.size,
        };
      });
      assert.equal(result.high, "completed");
      assert.equal(result.low, "completed");
      assert.ok(Math.abs(result.pose.x - result.anchor.x) < 1);
      assert.equal(result.tasks, 0);
    });
    await run("presence-async-graph", async (p) => {
      const result = await p.evaluate(async () => {
        let resolveOld, resolveNew;
        const old = world.track(new Promise((r) => (resolveOld = r)), "a");
        const latest = world.track(new Promise((r) => (resolveNew = r)), "a");
        resolveOld("stale");
        await old;
        resolveNew("fresh");
        await latest;
        let effects = 0;
        world.graph.connect({
          from: "a",
          to: "b",
          on: "success",
          effect: () => effects++,
        });
        world.emit("success", "a");
        const open = world.transition("dialog", true);
        for (let i = 0; i < 700; i++) world.step(1 / 120);
        await open;
        const visible = !document.querySelector("#dialog").hidden;
        const close = world.transition("dialog", false);
        for (let i = 0; i < 700; i++) world.step(1 / 120);
        await close;
        return {
          effects,
          successes: events.filter(
            (e) => e.type === "success" && e.target === "a",
          ).length,
          visible,
          hidden: document.querySelector("#dialog").hidden,
        };
      });
      assert.deepEqual(result, {
        effects: 1,
        successes: 2,
        visible: true,
        hidden: true,
      });
    });
    await run("layout-and-detached-surface", async (p) => {
      const before = await p.evaluate(
        () => world.spatial.surfaces.get("b").rect.x,
      );
      await p.locator("#b").evaluate((el) => {
        el.style.marginLeft = "200px";
      });
      await p.waitForTimeout(120);
      await p.evaluate(() => {
        world.spatial.dirty = true;
        world.step(1 / 60);
      });
      const after = await p.evaluate(
        () => world.spatial.surfaces.get("b").rect.x,
      );
      assert.ok(after > before + 50);
      await p.locator("#b").evaluate((el) => el.remove());
      await p.waitForTimeout(100);
      assert.equal(
        await p.evaluate(() => world.physics.bodies.has("b")),
        false,
      );
    });
    await run("reduced-motion-keyboard", async (p) => {
      await p.emulateMedia({ reducedMotion: "reduce" });
      await p.locator("#b").focus();
      await p.keyboard.press("Enter");
      await p.waitForTimeout(120);
      assert.ok(await p.evaluate(() => world.reducedMotion));
      assert.equal(
        await p.locator("#b").evaluate((el) => el.style.translate),
        "none",
      );
      assert.ok(
        await p.evaluate(() =>
          events.some(
            (e) =>
              e.type === "click" && e.target === "b" && e.source === "keyboard",
          ),
        ),
      );
      const result = await p.evaluate(async () => {
        const t = world.transition("dialog", true);
        return {
          result: await t,
          hidden: document.querySelector("#dialog").hidden,
        };
      });
      assert.equal(result.hidden, false);
    });
    await run(
      "lifecycle-listeners-plugins-and-style-restoration",
      async (p) => {
        const result = await p.evaluate(async () => {
          world.destroy();
          const target = document.querySelector("#a"),
            initial = target.getAttribute("style"),
            layers = document.querySelectorAll(".am-actor-layer").length;
          const original = EventTarget.prototype.addEventListener,
            remove = EventTarget.prototype.removeEventListener,
            records = [];
          EventTarget.prototype.addEventListener = function (
            type,
            listener,
            options,
          ) {
            records.push({
              target: this,
              type,
              listener,
              signal: options?.signal,
              removed: false,
            });
            return original.call(this, type, listener, options);
          };
          EventTarget.prototype.removeEventListener = function (
            type,
            listener,
            options,
          ) {
            for (const r of records)
              if (
                r.target === this &&
                r.type === type &&
                r.listener === listener
              )
                r.removed = true;
            return remove.call(this, type, listener, options);
          };
          let cleanup = 0;
          const snapshots = [];
          for (let i = 0; i < 25; i++) {
            const w = am.createWorld();
            w.register(target, { id: "repeat", draggable: true });
            w.addActor("canvas", { renderer: new am.CanvasActorRenderer() });
            w.use({
              name: "test",
              setup() {
                return () => cleanup++;
              },
            });
            w.use(am.devtools());
            w.on(() => {});
            w.destroy();
            snapshots.push(w.stats());
          }
          EventTarget.prototype.addEventListener = original;
          EventTarget.prototype.removeEventListener = remove;
          return {
            layers:
              document.querySelectorAll(".am-actor-layer").length - layers,
            devtools: document.querySelectorAll(".am-devtools").length,
            style: target.getAttribute("style"),
            initial,
            cleanup,
            activeListeners: records.filter(
              (r) => !r.removed && !r.signal?.aborted,
            ).length,
            snapshots,
          };
        });
        assert.equal(result.layers, 0);
        assert.equal(result.devtools, 0);
        assert.equal(result.cleanup, 25);
        assert.equal(result.activeListeners, 0);
        assert.equal(result.style, result.initial);
        assert.ok(
          result.snapshots.every(
            (s) =>
              s.surfaces === 0 &&
              s.tasks === 0 &&
              s.bodies === 0 &&
              s.actors === 0 &&
              s.listeners === 0 &&
              !s.running,
          ),
        );
      },
    );
    await run("react-vue-mount-and-unmount", async (p) => {
      await p.addScriptTag({
        url: base + "/artifacts/adapters.js",
        type: "module",
      });
      await p.waitForFunction(
        () =>
          document.querySelector("#adapters button") &&
          window.adapterWorlds?.filter(Boolean).length >= 2,
      );
      await p.waitForTimeout(250);
      const live = await p.evaluate(() =>
        adapterWorlds
          .filter((w) => w.stats().running)
          .map((w) => w.stats().surfaces),
      );
      assert.deepEqual(live, [1, 1]);
      await p.evaluate(() => unmountAdapters());
      assert.ok(
        await p.evaluate(() =>
          adapterWorlds.every((w) => !w || w.stats().surfaces === 0),
        ),
      );
    });
    const { coreCases } = await import("./core-cases.mjs");
    await coreCases(run);
    await context.close();
    // Real touch events through Playwright's browser protocol.
    const touch = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: engine.name() !== "firefox",
    });
    const tp = await touch.newPage();
    await tp.goto(base + "/tests/fixtures/runtime.html");
    await tp.waitForFunction(() => window.ready);
    await tp.locator("#b").tap();
    assert.ok(
      await tp.evaluate(() =>
        events.some((e) => e.type === "click" && e.source === "touch"),
      ),
    );
    report.cases.push({
      browser: engine.name(),
      name: "touch-tap-mobile",
      status: "passed",
    });
    await touch.close();
    const { measureRuntime } = await import("./runtime-measurements.mjs");
    await measureRuntime(browser, engine.name(), report);
    // Demo scenarios are mandatory after the framework fixture suite succeeds.
    if (!coreOnly)
      try {
        await access("demos/skeleton-pet/index.html");
        const { testDemos } = await import("./demo-tests.mjs");
        await testDemos(browser, report);
      } catch (e) {
        if (e.code === "ENOENT") {
          failed = true;
          report.cases.push({
            browser: engine.name(),
            name: "six-demos",
            status: "failed",
            error: "Demo entries missing",
          });
        } else throw e;
      }
  } catch (error) {
    failed = true;
    report.cases.push({
      browser: engine.name(),
      name: "engine-suite",
      status: "failed",
      error: String(error),
    });
    console.error(error);
  } finally {
    await browser?.close();
    await writeFile(
      coreOnly
        ? "test-results/core-browser-results.json"
        : "test-results/browser-results.json",
      JSON.stringify(report, null, 2),
    );
  }
}
stop();
await writeFile(
  coreOnly
    ? "test-results/core-browser-results.json"
    : "test-results/browser-results.json",
  JSON.stringify(report, null, 2),
);
if (failed || report.cases.some((c) => c.status === "failed"))
  process.exitCode = 1;
