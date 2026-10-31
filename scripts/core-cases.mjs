import assert from "node:assert/strict";
export async function coreCases(run) {
  await run("composition-priority-cancellation-and-async", async (p) => {
    const result = await p.evaluate(async () => {
      let count = 0;
      const w = world;
      const off = w.bind({
        id: "combo",
        on: ["click", "success"],
        target: "a",
        combine: { events: ["click", "success"], within: 500 },
        priority: 40,
        policy: "replace",
        create: () =>
          am.sequence([
            { duration: 0.02, update: () => count++ },
            { wait: () => Promise.resolve() },
            { duration: 0.02 },
          ]),
      });
      w.emit("click", "a");
      w.step(0.01);
      const before = count;
      w.emit("success", "a");
      for (let i = 0; i < 10; i++) w.step(0.01);
      await Promise.resolve();
      for (let i = 0; i < 10; i++) w.step(0.01);
      const after = count;
      off();
      w.emit("success", "a");
      return { before, after, tasks: w.arbiter.size };
    });
    assert.equal(result.before, 0);
    assert.ok(result.after > 0);
    assert.equal(result.tasks, 0);
  });
  await run("reentrant-graph-cycle-is-bounded", async (p) => {
    const result = await p.evaluate(() => {
      const errors = [],
        w = am.createWorld({
          autoStart: false,
          onError: (e) => errors.push(String(e)),
        });
      const el = document.createElement("button");
      document.body.append(el);
      w.register(el, { id: "cycle" });
      let events = 0;
      w.on((e) => {
        events++;
        w.emit(e.type, "cycle");
      });
      w.emit("click", "cycle");
      w.destroy();
      el.remove();
      return { errors, events };
    });
    assert.equal(result.events, 100);
    assert.equal(result.errors.length, 1);
  });
  await run("native-proximity-longpress-gesture-and-selection", async (p) => {
    await p.mouse.move(170, 130);
    await p.mouse.down();
    await p.waitForTimeout(560);
    await p.mouse.up();
    await p.locator("#a").dispatchEvent("pointerdown", {
      pointerId: 4,
      clientX: 110,
      clientY: 130,
      pointerType: "touch",
      button: 0,
    });
    await p.locator("#a").dispatchEvent("pointerdown", {
      pointerId: 5,
      clientX: 140,
      clientY: 130,
      pointerType: "touch",
      button: 0,
    });
    await p.locator("#a").dispatchEvent("pointermove", {
      pointerId: 4,
      clientX: 90,
      clientY: 130,
      pointerType: "touch",
    });
    await p.locator("#a").dispatchEvent("pointermove", {
      pointerId: 5,
      clientX: 190,
      clientY: 130,
      pointerType: "touch",
    });
    await p.locator("#a").dispatchEvent("pointercancel", { pointerId: 4 });
    await p.locator("#a").dispatchEvent("pointercancel", { pointerId: 5 });
    await p.evaluate(() => {
      const range = document.createRange();
      range.selectNodeContents(document.querySelector("#b"));
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await p.waitForTimeout(50);
    const types = await p.evaluate(() => events.map((e) => e.type));
    for (const name of ["proximity", "longpress", "gesture", "selection"])
      assert.ok(types.includes(name), name);
  });
  await run("viewport-scroll-refreshes-anchors", async (p) => {
    const before = await p.evaluate(
      () => world.spatial.surfaces.get("b").rect.y,
    );
    await p.evaluate(() => scrollTo(0, 250));
    await p.waitForTimeout(150);
    const after = await p.evaluate(
      () => world.spatial.surfaces.get("b").rect.y,
    );
    assert.ok(before - after > 100);
    assert.ok(await p.evaluate(() => events.some((e) => e.type === "scroll")));
  });
  await run("layout-transaction-preserves-position", async (p) => {
    const result = await p.evaluate(() => {
      const b = world.physics.bodies.get("b"),
        s = world.spatial.surfaces.get("b");
      const before = s.rect.x + b.position.x;
      world.layout(() => {
        s.element.style.marginLeft = "250px";
      });
      return {
        before,
        after: s.rect.x + b.position.x,
        offset: b.position.x,
        limit: b.motionLimit,
      };
    });
    assert.ok(Math.abs(result.before - result.after) < 1);
    assert.ok(Math.abs(result.offset) > 50);
    assert.ok(result.limit > 50);
  });
  await run("regional-opt-in-and-opt-out", async (p) => {
    const result = await p.evaluate(() => {
      const root = document.createElement("div");
      root.innerHTML =
        '<section class="off"><button>A</button></section><section class="on"><button>B</button></section>';
      document.body.append(root);
      const w = am.createWorld({
        root,
        mode: "both",
        autoStart: false,
        regions: [
          { selector: ".off", mode: "off" },
          { selector: ".on", mode: "field" },
        ],
      });
      w.register(root.querySelector(".off button"), { id: "off" });
      w.register(root.querySelector(".on button"), { id: "on" });
      w.step(0.01);
      w.emit("click", "off");
      w.emit("click", "on");
      const actor = w.addActor("a", { renderer: new am.SVGActorRenderer() });
      const result = {
        off: w.physics.bodies.get("off").velocity.y,
        on: w.physics.bodies.get("on").velocity.y,
      };
      const task = actor.moveTo("off");
      w.destroy();
      root.remove();
      return task.then((status) => ({ ...result, status }));
    });
    assert.equal(result.off, 0);
    assert.ok(result.on < 0);
    assert.equal(result.status, "cancelled");
  });
  await run("actor-drag-blend-and-contact", async (p) => {
    await p.evaluate(() => {
      world.setMode("both");
      window.testActor = world.addActor("drag-pet", {
        renderer: new am.SVGActorRenderer(),
        position: am.vec(200, 300),
        draggable: true,
        reactTo: [],
      });
    });
    const actor = p.locator(".am-actor");
    await actor.waitFor();
    const r = await actor.boundingBox();
    await p.mouse.move(r.x + 32, r.y + 32);
    await p.mouse.down();
    await p.mouse.move(370, 200, { steps: 8 });
    assert.equal(await p.evaluate(() => window.testActor.pose.state), "grab");
    await p.mouse.up();
    await p.waitForTimeout(1800);
    assert.ok(
      ["land", "idle"].includes(
        await p.evaluate(() => window.testActor.pose.state),
      ),
    );
    const weights = await p.evaluate(() =>
      Object.values(window.testActor.pose.weights),
    );
    assert.ok(Math.abs(weights.reduce((a, b) => a + b, 0) - 1) < 1e-8);
    await p.evaluate(() => world.setEnabled(false));
    assert.equal(await actor.isVisible(), false);
  });
  await run("all-semantic-levels-async-abort-and-native-styles", async (p) => {
    const result = await p.evaluate(async () => {
      for (const type of Object.keys(am.taxonomy)) world.emit(type, "b");
      const levels = [...new Set(events.map((e) => e.level))].sort();
      let resolve;
      const abort = new AbortController(),
        count = events.filter((e) => e.type === "success").length;
      const promise = world.track(
        new Promise((r) => (resolve = r)),
        "a",
        abort.signal,
      );
      abort.abort();
      resolve("late");
      await promise;
      const after = events.filter((e) => e.type === "success").length;
      const node = document.querySelector("#a");
      world.destroy();
      node.style.setProperty("translate", "3px 4px", "important");
      const w = am.createWorld({ autoStart: false });
      w.register(node, { id: "important" });
      w.step(0.01);
      w.destroy();
      return {
        levels,
        count,
        after,
        priority: node.style.getPropertyPriority("translate"),
        translate: node.style.translate,
      };
    });
    assert.deepEqual(result.levels, [0, 1, 2, 3, 4, 5, 6, 7]);
    assert.equal(result.count, result.after);
    assert.equal(result.priority, "important");
    assert.equal(result.translate, "3px 4px");
  });
  await run("custom-render-protocol-and-faulted-plugin-cleanup", async (p) => {
    const result = await p.evaluate(() => {
      const log = [],
        errors = [];
      class CustomField extends am.FieldRenderer {
        mount(s) {
          log.push("mount");
          super.mount(s);
        }
        render(s, b, dt, reduced) {
          log.push("render");
          super.render(s, b, dt, reduced);
        }
        unmount(s) {
          log.push("unmount");
          super.unmount(s);
        }
      }
      const w = am.createWorld({
        autoStart: false,
        fieldRenderer: new CustomField(),
        onError: (e) => errors.push(String(e)),
      });
      w.register(document.querySelector("#b"), { id: "custom" });
      w.step(0.02);
      w.use({
        name: "throwing-cleanup",
        setup: () => () => {
          throw Error("expected cleanup fault");
        },
      });
      w.destroy();
      return { log, errors, stats: w.stats() };
    });
    assert.ok(
      result.log.includes("mount") &&
        result.log.includes("render") &&
        result.log.includes("unmount"),
    );
    assert.equal(result.errors.length, 1);
    assert.equal(result.stats.surfaces, 0);
    assert.equal(result.stats.running, false);
  });
  await run("disabled-actor-and-direct-impulses", async (p) => {
    const result = await p.evaluate(async () => {
      world.setMode("both");
      const actor = world.addActor("disabled", {
        renderer: new am.SVGActorRenderer(),
      });
      world.setEnabled(false);
      const status = await actor.moveTo("a");
      world.physics.impulse("a", { x: 200 });
      return { status, velocity: world.physics.bodies.get("a").velocity.x };
    });
    assert.equal(result.status, "cancelled");
    assert.equal(result.velocity, 0);
  });
  await run("drag-release-keeps-visual-continuity", async (p) => {
    const result = await p.evaluate(() => {
      world.stop();
      world.input.pointer.active = false;
      world.emit("dragstart", "a");
      world.emit("drag", "a", { dx: 140, dy: 60 });
      const body = world.physics.bodies.get("a"),
        before = body.position.x;
      world.emit("dragend", "a");
      world.step(1 / 120);
      return { before, after: body.position.x, limit: body.motionLimit };
    });
    assert.ok(result.before > 100);
    assert.ok(Math.abs(result.before - result.after) < 10);
    assert.ok(result.limit > 100);
  });
  await run("moving-target-cannot-starve-actor-arrival", async (p) => {
    const result = await p.evaluate(async () => {
      world.stop();
      world.setMode("both");
      const actor = world.addActor("pursuit", {
        renderer: new am.SVGActorRenderer(),
        reactTo: [],
        position: am.vec(60, 350),
      });
      world.step(1 / 120);
      const body = world.physics.bodies.get("b");
      body.pinned = true;
      let landed = 0;
      const movement = actor.moveTo("b");
      for (let i = 0; i < 450; i++) {
        body.position.x = Math.sin(i * 0.23) * 24;
        world.step(1 / 120);
        if (actor.pose.state === "land") landed++;
      }
      const pending = world.arbiter.size;
      if (pending) world.arbiter.clear();
      return { result: await movement, pending, landed };
    });
    assert.equal(result.pending, 0);
    assert.equal(result.result, "completed");
    assert.ok(result.landed > 0);
  });
}
