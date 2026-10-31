import { test } from "node:test";
import assert from "node:assert/strict";
import { InteractionArbiter } from "../packages/core/src/interaction/arbiter.js";
import { InteractionGraph } from "../packages/core/src/interaction/graph.js";
import { BehaviorPlanner } from "../packages/core/src/actor/planner.js";
import { taxonomy, vec, type Interaction } from "../packages/core/src/types.js";
test("higher priority preempts and paused behavior resumes without losing progress", async () => {
  const a = new InteractionArbiter(),
    log: string[] = [];
  let count = 0;
  const low = a.enqueue({
    id: "idle",
    channel: "actor",
    priority: 1,
    pause: () => log.push("pause"),
    resume: () => log.push("resume"),
    update: () => ++count === 3,
  });
  a.tick(0.1);
  const high = a.enqueue({
    id: "user",
    channel: "actor",
    priority: 100,
    update: () => {
      log.push("user");
      return true;
    },
  });
  a.tick(0.1);
  a.tick(0.1);
  a.tick(0.1);
  assert.equal(await high, "completed");
  assert.equal(await low, "completed");
  assert.deepEqual(log, ["resume", "pause", "user", "resume"]);
  assert.equal(a.size, 0);
});
test("equal priority FIFO, independent channels, queued cancellation and abort", async () => {
  const a = new InteractionArbiter(),
    c = new AbortController(),
    log: string[] = [];
  const first = a.enqueue({
    id: "a",
    channel: "one",
    priority: 1,
    update: () => {
      log.push("a");
      return true;
    },
  });
  const second = a.enqueue({
    id: "b",
    channel: "one",
    priority: 1,
    signal: c.signal,
    update: () => {
      log.push("b");
      return true;
    },
  });
  const other = a.enqueue({
    id: "c",
    channel: "two",
    priority: 1,
    update: () => {
      log.push("c");
      return true;
    },
  });
  c.abort();
  a.tick(0.1);
  assert.deepEqual(log, ["a", "c"]);
  assert.equal(await second, "cancelled");
  await Promise.all([first, other]);
  assert.equal(a.size, 0);
});
test("clear resolves all tasks, duplicate IDs rejected, exceptions cancel failed tasks", async () => {
  const a = new InteractionArbiter();
  const p = a.enqueue({
    id: "a",
    channel: "x",
    priority: 0,
    update: () => false,
  });
  assert.throws(() =>
    a.enqueue({ id: "a", channel: "x", priority: 0, update: () => true }),
  );
  a.clear();
  assert.equal(await p, "cancelled");
  const failed = a.enqueue({
    id: "f",
    channel: "x",
    priority: 0,
    update: () => {
      throw Error("failed");
    },
  });
  assert.throws(() => a.tick(0.1));
  assert.equal(await failed, "cancelled");
  assert.equal(a.size, 0);
});
test("graph composes semantic levels, filters capabilities and removes stale edges", () => {
  const g = new InteractionGraph(),
    log: string[] = [];
  g.register("a", ["click"]);
  g.register("b", ["success"]);
  const off = g.connect({
    from: "a",
    to: "b",
    on: ["click", "focus"],
    when: (e) => e.level <= 2,
    effect: (e, id) => log.push(`${e.type}:${id}`),
  });
  const event: Interaction = {
    type: "click",
    level: 2,
    target: "a",
    time: 0,
    source: "application",
    point: vec(),
    velocity: vec(),
    data: {},
    originalEvent: null,
  };
  g.dispatch(event);
  assert.deepEqual(log, ["click:b"]);
  assert.ok(g.supports("a", "click"));
  assert.equal(g.supports("a", "input"), false);
  off();
  g.dispatch(event);
  assert.equal(log.length, 1);
  g.remove("b");
  assert.equal(g.snapshot().nodes.length, 1);
});
test("taxonomy covers all eight levels with unambiguous names", () => {
  assert.deepEqual(
    [...new Set(Object.values(taxonomy))].sort(),
    [0, 1, 2, 3, 4, 5, 6, 7],
  );
  assert.equal(taxonomy.loading, 7);
  assert.equal(taxonomy.drag, 2);
});
test("planner endpoints, arc clearance, and responsive motion duration", () => {
  const p = new BehaviorPlanner();
  const a = vec(0, 300),
    b = vec(400, 300);
  const path = p.plan(a, b, [{ x: 150, y: 180, width: 100, height: 120 }]);
  assert.deepEqual(p.sample(path, 0), a);
  assert.deepEqual(p.sample(path, 1), b);
  for (let i = 8; i <= 12; i++) assert.ok(p.sample(path, i / 20).y < 180 - 20);
  assert.ok(path.duration > 0.28);
  assert.equal(p.plan(a, b, [], "walk").height, 0);
  assert.ok(p.plan(a, b, [], "climb").duration > path.duration);
});

test("clearing never resumes queued behaviors and releases channel metadata", async () => {
  const a = new InteractionArbiter();
  let resumed = 0;
  const first = a.enqueue({
    id: "a",
    channel: "x",
    priority: 10,
    update: () => false,
  });
  const queued = a.enqueue({
    id: "b",
    channel: "x",
    priority: 1,
    resume: () => resumed++,
    update: () => false,
  });
  a.clear();
  assert.equal(resumed, 0);
  assert.deepEqual(await Promise.all([first, queued]), [
    "cancelled",
    "cancelled",
  ]);
  assert.deepEqual(a.snapshot(), []);
});
test("throwing resume/pause/cancel hooks do not retain broken entries", async () => {
  const a = new InteractionArbiter();
  assert.throws(() =>
    a.enqueue({
      id: "bad",
      channel: "x",
      priority: 1,
      resume() {
        throw Error("bad");
      },
      update: () => true,
    }),
  );
  assert.equal(a.size, 0);
  const p = a.enqueue({
    id: "cancel",
    channel: "x",
    priority: 1,
    cancel() {
      throw Error("bad cancel");
    },
    update: () => false,
  });
  assert.throws(() => a.clear());
  assert.equal(await p, "cancelled");
  assert.equal(a.size, 0);
  assert.deepEqual(a.snapshot(), []);
});

test("bulk cancellation cannot reinsert orphaned tasks", async () => {
  const a = new InteractionArbiter();
  const task = a.enqueue({
    id: "a",
    channel: "x",
    priority: 1,
    update: () => false,
    cancel: () => {
      a.enqueue({ id: "new", channel: "x", priority: 1, update: () => false });
    },
  });
  assert.throws(() => a.clear());
  assert.equal(await task, "cancelled");
  assert.equal(a.size, 0);
});
