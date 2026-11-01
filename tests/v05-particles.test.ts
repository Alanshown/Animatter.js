import { test } from "node:test";
import assert from "node:assert/strict";
import { ParticleSim, PARTICLE_LIMITS, pointsFromAlpha } from "../packages/core/src/particles/sim.js";

const finiteAll = (sim: ParticleSim) =>
  [sim.x, sim.y, sim.vx, sim.vy].every((arr) => Array.from(arr).every((v) => Number.isFinite(v)));

test("particle sim validates capacity and viewport", () => {
  assert.throws(() => new ParticleSim(0, 100, 100), RangeError);
  assert.throws(() => new ParticleSim(PARTICLE_LIMITS.count[1] + 1, 100, 100), RangeError);
  assert.throws(() => new ParticleSim(10.5, 100, 100), RangeError);
  assert.throws(() => new ParticleSim(10, 0, 100), RangeError);
});

test("particles stay inside the viewport and reflect with restitution", () => {
  const sim = new ParticleSim(500, 300, 200, 9);
  sim.flow = { strength: 0, scale: 0, speed: 0 };
  sim.emit(150, 100, 500, 900);
  for (let i = 0; i < 600; i++) sim.step(1 / 60);
  assert.ok(finiteAll(sim));
  for (let i = 0; i < sim.capacity; i++) {
    assert.ok(sim.x[i]! >= 0 && sim.x[i]! <= 300, `x ${sim.x[i]}`);
    assert.ok(sim.y[i]! >= 0 && sim.y[i]! <= 200, `y ${sim.y[i]}`);
  }
});

test("same seed gives the same initial state, different seeds differ", () => {
  const a = new ParticleSim(64, 100, 100, 42);
  const b = new ParticleSim(64, 100, 100, 42);
  const c = new ParticleSim(64, 100, 100, 43);
  assert.deepEqual(Array.from(a.x), Array.from(b.x));
  assert.notDeepEqual(Array.from(a.x), Array.from(c.x));
});

test("attract field pulls particles toward its centre; repel pushes them away", () => {
  const meanDistance = (sim: ParticleSim, cx: number, cy: number) => {
    let sum = 0;
    for (let i = 0; i < sim.capacity; i++) sum += Math.hypot(sim.x[i]! - cx, sim.y[i]! - cy);
    return sum / sim.capacity;
  };
  const attract = new ParticleSim(300, 400, 400, 5);
  attract.flow = { strength: 0, scale: 0, speed: 0 };
  attract.drag = 0.2;
  attract.setField({ kind: "attract", x: 200, y: 200, strength: 900, radius: 400 }, 0);
  const before = meanDistance(attract, 200, 200);
  for (let i = 0; i < 240; i++) attract.step(1 / 60);
  assert.ok(meanDistance(attract, 200, 200) < before * 0.8, "attract shrinks the cloud");

  const repel = new ParticleSim(300, 400, 400, 5);
  repel.flow = { strength: 0, scale: 0, speed: 0 };
  repel.drag = 0.2;
  repel.setField({ kind: "repel", x: 200, y: 200, strength: 900, radius: 400 }, 0);
  const r0 = meanDistance(repel, 200, 200);
  for (let i = 0; i < 60; i++) repel.step(1 / 60);
  assert.ok(meanDistance(repel, 200, 200) > r0, "repel spreads the cloud");
});

test("vortex field produces swirl; fields with bad values are rejected", () => {
  const sim = new ParticleSim(1, 400, 400, 3);
  sim.x[0] = 300;
  sim.y[0] = 200;
  sim.vx[0] = 0;
  sim.vy[0] = 0;
  sim.flow = { strength: 0, scale: 0, speed: 0 };
  sim.drag = 0;
  sim.setField({ kind: "vortex", x: 200, y: 200, strength: 200, radius: 300 }, 0);
  sim.step(1 / 60);
  assert.ok(Math.abs(sim.vy[0]!) > Math.abs(sim.vx[0]!), "tangential at the rightmost point points along y");
  assert.throws(() => sim.setField({ kind: "attract", x: Number.NaN, y: 0, strength: 1, radius: 1 }, 0), TypeError);
  assert.throws(() => sim.setField({ kind: "attract", x: 0, y: 0, strength: 1, radius: 0 }, 0), RangeError);
  assert.throws(() => sim.setField(null, 4), RangeError);
  sim.setField(null, 0);
});

test("extreme field strength never produces non-finite state", () => {
  const sim = new ParticleSim(800, 500, 500, 11);
  sim.setField({ kind: "attract", x: 250, y: 250, strength: 1e9, radius: 500 }, 0);
  sim.setField({ kind: "vortex", x: 250, y: 250, strength: 1e9, radius: 500 }, 1);
  for (let i = 0; i < 600; i++) sim.step(1 / 60);
  assert.ok(finiteAll(sim));
  assert.ok(Number.isFinite(sim.meanSpeed()));
});

test("emit recycles slots and returns the number emitted", () => {
  const sim = new ParticleSim(10, 100, 100, 2);
  assert.equal(sim.emit(50, 50, 4), 4);
  assert.equal(sim.emit(50, 50, 100), 10, "capped at capacity");
  assert.equal(sim.emit(50, 50, -3), 0);
  assert.equal(sim.x[0], 50);
});

test("resize keeps particles in the new viewport proportionally", () => {
  const sim = new ParticleSim(20, 100, 100, 8);
  sim.resize(200, 50);
  for (let i = 0; i < sim.capacity; i++) {
    assert.ok(sim.x[i]! <= 200 && sim.y[i]! <= 50);
  }
  assert.throws(() => sim.resize(0, 10), RangeError);
});

test("particles never end inside an obstacle rectangle and bounce off its faces", () => {
  const sim = new ParticleSim(400, 500, 400, 21);
  sim.flow = { strength: 0, scale: 0, speed: 0 };
  sim.setObstacles([{ x: 200, y: 150, width: 100, height: 100 }]);
  sim.emit(60, 200, 400, 600);
  for (let i = 0; i < 900; i++) sim.step(1 / 60);
  assert.ok(finiteAll(sim));
  let inside = 0;
  for (let i = 0; i < sim.capacity; i++) {
    const x = sim.x[i]!;
    const y = sim.y[i]!;
    if (x > 200 && x < 300 && y > 150 && y < 250) inside++;
  }
  assert.equal(inside, 0);
  assert.throws(() => sim.setObstacles([{ x: 0, y: 0, width: 0, height: 5 }]), RangeError);
});

test("text targets pull particles toward their assigned points", () => {
  const sim = new ParticleSim(64, 300, 300, 4);
  sim.flow = { strength: 0, scale: 0, speed: 0 };
  sim.drag = 3;
  const targets = new Float32Array(64 * 2);
  for (let i = 0; i < 64; i++) {
    targets[i * 2] = 100 + (i % 8) * 12;
    targets[i * 2 + 1] = 100 + Math.floor(i / 8) * 12;
  }
  sim.setTargets(targets, 30);
  for (let i = 0; i < 600; i++) sim.step(1 / 60);
  assert.ok(finiteAll(sim));
  let worst = 0;
  for (let i = 0; i < 64; i++) worst = Math.max(worst, Math.hypot(sim.x[i]! - targets[i * 2]!, sim.y[i]! - targets[i * 2 + 1]!));
  assert.ok(worst < 4, `worst distance to target ${worst}`);
  sim.setTargets(null);
  assert.equal(sim.targetStrength, 0);
  assert.throws(() => sim.setTargets([1, 2, 3]), TypeError);
});

test("pointsFromAlpha keeps opaque samples on a grid and validates input", () => {
  const w = 8;
  const h = 4;
  const data = new Uint8ClampedArray(w * h * 4);
  data[(2 * w + 4) * 4 + 3] = 255; // (4, 2) opaque
  data[(0 * w + 0) * 4 + 3] = 100; // (0, 0) too faint
  const pts = pointsFromAlpha(data, w, h, 1);
  assert.deepEqual(Array.from(pts), [4, 2]);
  assert.throws(() => pointsFromAlpha(new Uint8Array(4), w, h), RangeError);
  assert.throws(() => pointsFromAlpha(data, w, h, 0), RangeError);
});
