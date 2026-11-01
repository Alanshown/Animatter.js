import { test } from "node:test";
import assert from "node:assert/strict";
import { RopeSolver, normaliseRopeOptions } from "../packages/core/src/rope/solver.js";
import { createRope } from "../packages/core/src/rope/rope.js";
import { createSoftBody, normaliseSoftBodyOptions, polygonArea } from "../packages/core/src/softbody/body.js";
import { evaluateField } from "../packages/core/src/renderers/metaball.js";
import type { AnimatterWorld, WorldSystem } from "../packages/core/src/world.js";

/** Minimal world double: runs attached systems on a fixed 1/120 s schedule, like AnimatterWorld.step. */
function fakeWorld() {
  const systems = new Set<WorldSystem>();
  const world = {
    attach(system: WorldSystem) {
      systems.add(system);
      return () => {
        if (systems.delete(system)) system.destroy?.();
      };
    },
    run(seconds: number) {
      // Mirrors AnimatterWorld.step: fixed substeps, then one frame callback per rendered step.
      const steps = Math.round(seconds * 120);
      for (let i = 0; i < steps; i++) for (const s of systems) s.fixedStep?.(1 / 120);
      for (const s of systems) s.frame?.(seconds);
    },
    count: () => systems.size,
  };
  return world;
}
const finite = (arr: ArrayLike<number>) => Array.from(arr).every((v) => Number.isFinite(v));

test("rope solver: free fall under gravity stays finite and moves down", () => {
  const solver = new RopeSolver({ x: 0, y: 0 }, { x: 240, y: 0 }, { segments: 12, length: 240, gravity: { x: 0, y: 600 } });
  solver.pin(0, 0, 0);
  for (let i = 0; i < 360; i++) solver.step(1 / 120);
  assert.ok(finite(solver.pos));
  const lastY = solver.pos[solver.nodeCount * 2 - 1]!;
  assert.ok(lastY > 0, "free nodes fall");
  assert.equal(solver.pos[0], 0, "pinned node stays exact");
  assert.equal(solver.pos[1], 0);
});

test("rope solver: pinned ends converge to near rest length and sag under gravity", () => {
  const solver = new RopeSolver({ x: 0, y: 0 }, { x: 200, y: 0 }, { segments: 20, length: 240, gravity: { x: 0, y: 400 }, iterations: 16 });
  const last = solver.nodeCount - 1;
  solver.pin(0, 0, 0);
  solver.pin(last, 200, 0);
  for (let i = 0; i < 1200; i++) solver.step(1 / 120);
  assert.ok(finite(solver.pos));
  const stretch = solver.stretch();
  assert.ok(stretch < 1.0 && stretch > 0.8, `stretch ${stretch}`);
  const midY = solver.pos[Math.floor(last / 2) * 2 + 1]!;
  assert.ok(midY > 5, `rope sags, midY ${midY}`);
});

test("rope solver: violent anchor jumps never produce NaN or unbounded growth", () => {
  const solver = new RopeSolver({ x: 0, y: 0 }, { x: 240, y: 0 }, { segments: 16, length: 240, maxStep: 40 });
  const last = solver.nodeCount - 1;
  solver.pin(0, 0, 0);
  solver.pin(last, 240, 0);
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let i = 0; i < 2000; i++) {
    if (i % 15 === 0) solver.moveAnchor(last, 240 + rand() * 4000, rand() * 4000);
    solver.step(1 / 60);
    assert.ok(finite(solver.pos), `finite at step ${i}`);
  }
  let maxRadius = 0;
  for (let i = 0; i < solver.nodeCount; i++) maxRadius = Math.max(maxRadius, Math.hypot(solver.pos[i * 2]!, solver.pos[i * 2 + 1]!));
  assert.ok(maxRadius < 10000, `bounded, max radius ${maxRadius}`);
});

test("rope solver: invalid options are rejected", () => {
  assert.throws(() => normaliseRopeOptions({ segments: 0 }), RangeError);
  assert.throws(() => normaliseRopeOptions({ segments: 2.5 }), RangeError);
  assert.throws(() => normaliseRopeOptions({ length: -1 }), RangeError);
  assert.throws(() => normaliseRopeOptions({ stiffness: 2 }), RangeError);
  assert.throws(() => normaliseRopeOptions({ damping: Number.NaN }), RangeError);
  assert.throws(() => normaliseRopeOptions({ iterations: 0 }), RangeError);
  assert.throws(() => normaliseRopeOptions({ gravity: { x: Infinity, y: 0 } }), RangeError);
});

test("rope handle: attached ends hold, a stretched rope breaks, reconnect restores the end", () => {
  const world = fakeWorld();
  const rope = createRope(world as unknown as AnimatterWorld, {
    segments: 10,
    length: 200,
    start: { x: 0, y: 0 },
    end: { x: 200, y: 0 },
    breakStretch: 1.5,
  });
  let target = { x: 200, y: 0 };
  const breaks: string[] = [];
  rope.onBreak((end) => breaks.push(end));
  rope.attachA({ x: 0, y: 0 });
  rope.attachB(() => target);
  world.run(1);
  assert.equal(rope.state("a"), "attached");
  assert.equal(rope.state("b"), "attached");
  assert.ok(rope.stretch() < 1.05);
  target = { x: 400, y: 0 }; // 2x length apart: beyond breakStretch 1.5
  world.run(0.05);
  assert.equal(rope.state("b"), "broken");
  assert.deepEqual(breaks, ["b"], "break fires once");
  world.run(0.5);
  assert.deepEqual(breaks, ["b"], "no repeated break events while broken");
  target = { x: 210, y: 0 };
  assert.equal(rope.reconnect("b"), true);
  world.run(0.5);
  assert.equal(rope.state("b"), "attached");
  rope.destroy();
  assert.equal(world.count(), 0, "destroy detaches the system");
  assert.throws(() => rope.attachA({ x: 0, y: 0 }), /destroyed/);
});

test("rope handle: a function anchor returning null frees its end", () => {
  const world = fakeWorld();
  const rope = createRope(world as unknown as AnimatterWorld, { segments: 6, length: 120 });
  let present = true;
  rope.attachA(() => (present ? { x: 0, y: 0 } : null));
  world.run(0.2);
  assert.equal(rope.state("a"), "attached");
  present = false;
  world.run(0.05);
  assert.equal(rope.state("a"), "free");
  assert.equal(rope.reconnect("a"), false, "no point to reconnect to");
  rope.destroy();
});

test("rope handle: setLength changes rest length and rejects bad values", () => {
  const world = fakeWorld();
  const rope = createRope(world as unknown as AnimatterWorld, { segments: 8, length: 160, start: { x: 0, y: 0 }, end: { x: 160, y: 0 } });
  rope.setLength(320);
  assert.throws(() => rope.setLength(0), RangeError);
  rope.destroy();
});

test("soft body: defaults are finite, area starts at rest and recovers after a squash", () => {
  const world = fakeWorld();
  const body = createSoftBody(world as unknown as AnimatterWorld, { points: 20, radius: 80, center: { x: 300, y: 300 }, pressure: 1 });
  const rest = body.area();
  assert.ok(Math.abs(rest - Math.PI * 80 * 80) / (Math.PI * 80 * 80) < 0.02, `rest area ${rest}`);
  body.impulse({ x: 300, y: 300 }, -0.5, 1000); // collapse inward
  world.run(0.2);
  const squashed = body.area();
  world.run(4);
  assert.ok(finite(body.positions()));
  const recovered = body.area();
  assert.ok(Math.abs(recovered - rest) / rest < 0.2, `area ${recovered} vs rest ${rest} (squashed ${squashed})`);
  body.destroy();
});

test("soft body: impulse energy decays and bounds are respected", () => {
  const world = fakeWorld();
  const bounds = { x: 0, y: 0, width: 400, height: 300 };
  const body = createSoftBody(world as unknown as AnimatterWorld, { points: 16, radius: 60, center: { x: 200, y: 150 }, bounds });
  body.impulse({ x: 200, y: 150 }, 5000, 400);
  world.run(0.05);
  const spike = body.energy();
  world.run(3);
  assert.ok(finite(body.positions()));
  assert.ok(body.energy() < spike / 4 || body.energy() < 1, `energy decays: ${spike} -> ${body.energy()}`);
  const p = body.positions();
  for (let i = 0; i < body.count; i++) {
    assert.ok(p[i * 2]! >= bounds.x - 1e-3 && p[i * 2]! <= bounds.x + bounds.width + 1e-3, "x inside bounds");
    assert.ok(p[i * 2 + 1]! >= bounds.y - 1e-3 && p[i * 2 + 1]! <= bounds.y + bounds.height + 1e-3, "y inside bounds");
  }
  body.destroy();
});

test("soft body: grab, drag and release move one particle only while held", () => {
  const world = fakeWorld();
  const body = createSoftBody(world as unknown as AnimatterWorld, { points: 12, radius: 50, center: { x: 200, y: 200 } });
  const p = body.positions();
  const startX = p[0]!;
  const startY = p[1]!;
  assert.equal(body.grab({ x: 9999, y: 9999 }), false, "far away does not grab");
  assert.equal(body.grab({ x: startX, y: startY }), true);
  body.drag({ x: startX + 60, y: startY });
  world.run(1);
  assert.ok(Math.abs(p[0]! - (startX + 60)) < 1e-3, `held particle follows the pointer, x=${p[0]}`);
  assert.ok(finite(p));
  body.release();
  world.run(2);
  assert.ok(finite(p));
  assert.ok(Math.abs(p[0]! - (startX + 60)) > 1, "released particle is no longer pinned to the pointer");
  body.destroy();
});

test("soft body: invalid options are rejected", () => {
  assert.throws(() => normaliseSoftBodyOptions({ points: 2 }), RangeError);
  assert.throws(() => normaliseSoftBodyOptions({ points: 65 }), RangeError);
  assert.throws(() => normaliseSoftBodyOptions({ stiffness: 1.5 }), RangeError);
  assert.throws(() => normaliseSoftBodyOptions({ pressure: -1 }), RangeError);
  assert.throws(() => normaliseSoftBodyOptions({ radius: 0 }), RangeError);
  assert.throws(() => normaliseSoftBodyOptions({ center: { x: Number.NaN, y: 0 } }), RangeError);
});

test("polygon area matches a known square", () => {
  const square = Float32Array.from([0, 0, 10, 0, 10, 10, 0, 10]);
  assert.equal(polygonArea(square, 4), 100);
});

test("metaball field: peak at the blob centre, zero far away, additive near each other", () => {
  const out = new Float32Array(100 * 100);
  evaluateField([{ x: 50, y: 50, r: 10 }], 100, 100, 1, out);
  const at = (x: number, y: number) => out[y * 100 + x]!;
  assert.ok(at(50, 50) > at(60, 50), "centre is brightest");
  assert.equal(at(0, 0), 0, "far corner is untouched");
  const single = at(55, 50);
  evaluateField([{ x: 50, y: 50, r: 10 }, { x: 60, y: 50, r: 10 }], 100, 100, 1, out);
  assert.ok(at(55, 50) > single, "overlapping blobs add up");
  evaluateField([{ x: Number.NaN, y: 0, r: 5 }, { x: 10, y: 10, r: 0 }], 100, 100, 1, out);
  assert.ok(out.every((v) => v === 0), "invalid blobs contribute nothing");
});
