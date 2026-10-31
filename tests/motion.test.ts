import { test } from "node:test";
import assert from "node:assert/strict";
import { MotionMixer } from "../packages/core/src/actor/motion.js";
import { sequence } from "../packages/core/src/interaction/composition.js";
import { PhysicsEngine } from "../packages/core/src/physics/engine.js";
import {
  radialField,
  orbitalField,
} from "../packages/core/src/physics/fields.js";
test("motion blend stays normalized across real-time interrupts", () => {
  const m = new MotionMixer(0.2);
  m.transition("jump");
  m.tick(0.02);
  assert.ok(m.weights.idle > 0 && m.weights.jump > 0);
  m.transition("grab");
  for (let i = 0; i < 100; i++) {
    m.tick(0.01);
    assert.ok(
      Math.abs(Object.values(m.weights).reduce((a, b) => a + b, 0) - 1) < 1e-10,
    );
  }
  assert.ok(m.weights.grab > 0.99);
  m.transition("land");
  for (let i = 0; i < 30; i++) m.tick(0.01);
  assert.equal(m.state, "idle");
  m.transition("climb");
  m.tick(0.01, true);
  assert.equal(m.weights.climb, 1);
});
test("cooperative sequences preserve async completion, respect cancellation and propagate failure", async () => {
  let progress = 0,
    resolve!: () => void;
  const s = sequence([
    { duration: 0.1, update: (p) => (progress = p) },
    { wait: () => new Promise<void>((r) => (resolve = r)) },
    { duration: 0.1 },
  ]);
  assert.equal(s.update(0.05), false);
  assert.equal(progress, 0.5);
  s.update(0.05);
  assert.equal(s.update(0.01), false);
  resolve();
  await Promise.resolve();
  assert.equal(s.update(0.01), false);
  assert.equal(s.update(0.1), true);
  let called = false;
  const cancelled = sequence([
    {
      wait: async () => {
        called = true;
      },
    },
  ]);
  cancelled.cancel?.();
  assert.equal(cancelled.update(0.1), true);
  assert.equal(called, false);
  const failed = sequence([
    { wait: () => Promise.reject(Error("operation failed")) },
  ]);
  failed.update(0.01);
  await Promise.resolve();
  assert.throws(() => failed.update(0.01));
});
test("2.5D depth-separated bodies do not collide in screen space", () => {
  const p = new PhysicsEngine(),
    a = p.create("a"),
    b = p.create("b");
  a.collision = b.collision = true;
  a.size = b.size = { width: 30, height: 30 };
  b.origin.x = 15;
  b.origin.z = 100;
  p.step(1 / 120);
  assert.equal(a.position.x, 0);
  assert.equal(b.position.x, 0);
});
test("field factories return finite bounded forces and no force when inactive", () => {
  const p = new PhysicsEngine(),
    body = p.create("a");
  const context = {
    body,
    surface: { anchors: { center: { x: 100, y: 100, z: 0 } } },
    point: { x: 160, y: 100, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    active: true,
    time: 0,
  } as Parameters<ReturnType<typeof radialField>["sample"]>[0];
  assert.ok(radialField("a").sample(context).x! > 0);
  assert.ok(orbitalField("a").sample(context).y! < 0);
  context.active = false;
  assert.equal(radialField("a").sample(context).x, 0);
});

test("climb follows target side geometry and slide has inertial timing", async () => {
  const { BehaviorPlanner } = await import(
    "../packages/core/src/actor/planner.js"
  );
  const p = new BehaviorPlanner(),
    from = { x: 0, y: 200, z: 0 },
    to = { x: 200, y: 80, z: 0 };
  const climb = p.plan(from, to, [], "climb", {
    x: 100,
    y: 84,
    width: 200,
    height: 150,
  });
  assert.equal(climb.waypoints.length, 4);
  assert.ok(climb.waypoints[1]!.x < 100);
  assert.equal(climb.waypoints[2]!.y, 80);
  assert.deepEqual(p.sample(climb, 1), to);
  const slide = p.plan(from, to, [], "slide"),
    walk = p.plan(from, to, [], "walk");
  assert.ok(p.sample(slide, 0.3).x > p.sample(walk, 0.3).x);
});

test("viewport jump constraint uses depth instead of leaving the screen", async () => {
  const { BehaviorPlanner } = await import(
    "../packages/core/src/actor/planner.js"
  );
  const p = new BehaviorPlanner(),
    path = p.plan(
      { x: 50, y: 100, z: 0 },
      { x: 400, y: 90, z: 0 },
      [{ x: 150, y: 70, width: 100, height: 200 }],
      "jump",
      undefined,
      { x: 0, y: 66, width: 500, height: 700 },
    );
  assert.ok(path.depthArc > 0);
  for (let i = 0; i <= 100; i++) assert.ok(p.sample(path, i / 100).y >= 66);
});
