import { test } from "node:test";
import assert from "node:assert/strict";
import { PhysicsEngine } from "../packages/core/src/physics/engine.js";
import { resolveMaterial } from "../packages/core/src/materials.js";
import { vec } from "../packages/core/src/types.js";
test("spring impulse converges and simulation is deterministic", () => {
  const run = () => {
    const p = new PhysicsEngine(),
      b = p.create("a");
    p.impulse("a", { x: 100, y: -200, z: 50 });
    let peak = 0;
    for (let i = 0; i < 1200; i++) {
      p.step(1 / 120);
      peak = Math.max(peak, Math.abs(b.position.x));
    }
    return { position: b.position, velocity: b.velocity, peak };
  };
  const a = run();
  assert.deepEqual(a, run());
  assert.ok(a.peak > 1);
  assert.ok(Math.abs(a.position.x) < 0.001);
  assert.equal(a.velocity.x, 0);
});
test("target displacement and 2.5D depth remain bounded", () => {
  const p = new PhysicsEngine(),
    b = p.create("a", { maxDisplacement: 20, depth: 8 });
  b.target = vec(900, -900, 900);
  for (let i = 0; i < 1200; i++) p.step(1 / 120);
  assert.ok(Math.abs(b.position.x) <= 20);
  assert.ok(Math.abs(b.position.z) <= 8);
});
test("collision separates overlapping bodies, with pinned obstacle", () => {
  const p = new PhysicsEngine(),
    a = p.create("a"),
    b = p.create("b");
  a.collision = b.collision = true;
  a.size = b.size = { width: 20, height: 20 };
  b.origin.x = 15;
  b.pinned = true;
  p.step(1 / 120);
  assert.ok(a.position.x <= -5);
  assert.equal(b.position.x, 0);
});
test("distance constraints respect inverse mass and pinned endpoints", () => {
  const p = new PhysicsEngine(),
    a = p.create("a"),
    b = p.create("b");
  a.pinned = true;
  b.origin.x = 100;
  p.constraints.add({ a: "a", b: "b", distance: 60, stiffness: 1 });
  p.step(1 / 120);
  assert.equal(b.position.x, -40);
  assert.equal(a.position.x, 0);
  p.remove("b");
  assert.equal(p.constraints.size, 0);
});
test("viewport boundaries and removal clean up state", () => {
  const p = new PhysicsEngine(),
    b = p.create("a");
  p.bounds = { x: 0, y: 0, width: 100, height: 100 };
  b.origin = vec(95, 95);
  b.size = { width: 20, height: 20 };
  p.step(1 / 120);
  assert.ok(b.position.x <= -15);
  p.remove("a");
  assert.equal(p.bodies.size, 0);
});
test("reject invalid materials and ignore invalid timesteps", () => {
  assert.throws(() => resolveMaterial({ mass: 0 }));
  assert.throws(() => resolveMaterial({ damping: NaN }));
  const p = new PhysicsEngine(),
    b = p.create("a");
  assert.throws(() => p.create("a"));
  p.step(NaN);
  p.step(-1);
  assert.deepEqual(b.position, vec());
});
test("gravity balances at spring equilibrium", () => {
  const p = new PhysicsEngine(),
    b = p.create("a", { gravity: 100, mass: 2, stiffness: 100, damping: 25 });
  for (let i = 0; i < 1500; i++) p.step(1 / 120);
  assert.ok(Math.abs(b.position.y - 2) < 0.01);
});

test("disabled physics ignores direct impulses and rejects non-finite active impulses", () => {
  const p = new PhysicsEngine(),
    b = p.create("a");
  p.enabled = false;
  p.impulse("a", { x: 100 });
  p.step(0.01);
  assert.equal(b.velocity.x, 0);
  p.enabled = true;
  assert.throws(() => p.impulse("a", { x: NaN }));
});
