import { test } from "node:test";
import assert from "node:assert/strict";
import { BehaviourMachine, BEHAVIOUR_PROFILES, type BehaviourProfile } from "../packages/core/src/actor/behaviours.js";

const base: BehaviourProfile = { ...BEHAVIOUR_PROFILES.calm, idleInterval: [1, 1], restChance: 0, restAfter: 999, curiosity: 0 };
const sequence = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length]!;
};
const surfaces = ["a", "b", "c", "d"];
/** tick() clamps each call to 0.25 s, so advance in small steps the way a real frame loop does. */
const advance = (m: BehaviourMachine, seconds: number) => {
  const out: unknown[] = [];
  for (let t = 0; t < seconds - 1e-9; t += 0.05) out.push(...m.tick(0.05));
  return out;
};

test("the first idle decision moves toward a target and marks it as visited", () => {
  const m = new BehaviourMachine(base, { targets: () => surfaces, random: sequence([0.5]) });
  assert.deepEqual(advance(m, 1.05), [{ type: "moveTo", target: "c", kind: "walk" }]);
  assert.equal(m.state, "exploring");
  assert.equal(m.memory.lastAction, "moveTo:c");
});

test("recent targets are remembered newest first, without duplicates, capped at five", () => {
  const m = new BehaviourMachine(base, { targets: () => surfaces, random: sequence([0.1]) });
  for (const t of ["a", "b", "a", "c", "d", "e", "f"]) m.follow(t);
  assert.deepEqual(m.memory.recentTargets, ["f", "e", "d", "c", "a"]);
});

test("picking avoids recent targets when alternatives exist", () => {
  const m = new BehaviourMachine(base, { targets: () => ["a", "b"], random: sequence([0.9]) });
  m.follow("a");
  m.signal("arrived");
  assert.equal(m.pickTarget(), "b");
});

test("curiosity prefers a target never visited before", () => {
  const m = new BehaviourMachine({ ...base, curiosity: 1 }, { targets: () => ["a", "b", "c"], random: sequence([0.1, 0.1]) });
  m.follow("a");
  m.signal("arrived");
  m.memory.recentTargets = [];
  assert.equal(m.pickTarget(), "b", "b and c are unvisited; a is not");
});

test("success celebrates for the reaction duration and then returns to idle", () => {
  const m = new BehaviourMachine(base, { targets: () => surfaces, random: sequence([0.5]) });
  assert.deepEqual(m.signal("success"), [{ type: "celebrate", target: null }]);
  assert.equal(m.state, "celebrating");
  advance(m, 0.5);
  assert.equal(m.state, "celebrating");
  advance(m, 1);
  assert.equal(m.state, "idle");
});

test("error shakes the actor and loading blocks wandering until loaded", () => {
  const m = new BehaviourMachine(base, { targets: () => surfaces, random: sequence([0.5]) });
  assert.deepEqual(m.signal("error"), [{ type: "shake", target: null }]);
  assert.equal(m.state, "erroring");
  advance(m, 5);
  assert.notEqual(m.state, "erroring", "the reaction has ended");
  assert.deepEqual(m.signal("loading"), [{ type: "wait" }]);
  assert.deepEqual(advance(m, 10), [], "no wandering while loading");
  m.signal("loaded");
  assert.equal(m.state, "idle");
});

test("a drag interrupts a walk and the calm profile resumes the same target afterwards", () => {
  const m = new BehaviourMachine(base, { targets: () => surfaces, random: sequence([0.1]) });
  m.follow("b");
  m.follow(null);
  m.signal("arrived");
  // Start exploring toward a fresh target, then drag mid-walk.
  advance(m, 1.05);
  const walking = m.currentTarget;
  assert.ok(walking);
  assert.deepEqual(m.signal("dragstart"), []);
  assert.equal(m.state, "dragged");
  assert.deepEqual(m.memory.interrupted, { target: walking });
  assert.deepEqual(advance(m, 10), [], "no decisions while dragged");
  assert.deepEqual(m.signal("dragend"), [{ type: "moveTo", target: walking, kind: "walk" }]);
  assert.equal(m.memory.interrupted, null);
});

test("the busy profile does not resume after a drag", () => {
  const m = new BehaviourMachine({ ...BEHAVIOUR_PROFILES.busy, idleInterval: [1, 1] }, { targets: () => surfaces, random: sequence([0.1]) });
  advance(m, 1.05);
  m.signal("dragstart");
  assert.deepEqual(m.signal("dragend"), []);
  assert.equal(m.state, "idle");
});

test("resting happens after the idle threshold when the chance allows it", () => {
  const m = new BehaviourMachine({ ...base, restAfter: 2, restChance: 1 }, { targets: () => surfaces, random: sequence([0.01]) });
  // The first decision may walk. Arrive, then keep idling until the rest threshold triggers.
  const commands: { type: string }[] = [];
  for (let i = 0; i < 200 && !commands.some((c) => c.type === "rest"); i++) {
    const out = advance(m, 0.25) as { type: string }[];
    commands.push(...out);
    if (out.some((c) => c.type === "moveTo")) m.signal("arrived");
  }
  assert.ok(commands.some((c) => c.type === "rest"), "rest was reached");
  assert.equal(m.state, "resting");
});

test("follow moves toward the target and suppresses wandering until released", () => {
  const m = new BehaviourMachine(base, { targets: () => surfaces, random: sequence([0.5]) });
  assert.deepEqual(m.follow("d"), [{ type: "moveTo", target: "d", kind: "walk" }]);
  assert.equal(m.state, "following");
  assert.deepEqual(advance(m, 20), []);
  m.follow(null);
  assert.equal(m.state, "idle");
});

test("an empty target list produces no movement and no errors", () => {
  const m = new BehaviourMachine(base, { targets: () => [], random: sequence([0.5]) });
  assert.deepEqual(advance(m, 5), []);
  assert.equal(m.pickTarget(), null);
});

test("ticks with non-finite or negative time are ignored", () => {
  const m = new BehaviourMachine(base, { targets: () => surfaces, random: sequence([0.5]) });
  assert.deepEqual(m.tick(Number.NaN), []);
  assert.deepEqual(m.tick(-1), []);
  assert.equal(m.state, "idle");
});

test("invalid profiles are rejected", () => {
  const ctx = { targets: () => surfaces };
  assert.throws(() => new BehaviourMachine({ ...base, idleInterval: [0, 1] }, ctx), RangeError);
  assert.throws(() => new BehaviourMachine({ ...base, idleInterval: [5, 1] }, ctx), RangeError);
  assert.throws(() => new BehaviourMachine({ ...base, curiosity: 2 }, ctx), RangeError);
  assert.throws(() => new BehaviourMachine({ ...base, restChance: -0.1 }, ctx), RangeError);
  assert.throws(() => new BehaviourMachine({ ...base, reactionDuration: 0 }, ctx), RangeError);
});

test("behaviour memory is bounded over a long run", () => {
  const m = new BehaviourMachine({ ...base, idleInterval: [0.5, 0.5] }, { targets: () => ["a", "b", "c", "d", "e", "f", "g", "h"], random: Math.random });
  for (let i = 0; i < 4000; i++) {
    m.tick(0.1);
    if (m.state === "exploring") m.signal("arrived");
  }
  assert.ok(m.memory.recentTargets.length <= 5);
  assert.ok(Number.isFinite(m.memory.idleTime));
});
