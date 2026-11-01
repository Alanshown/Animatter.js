import { test } from "node:test";
import assert from "node:assert/strict";
import {
  proximityScale,
  springStep,
  reorderIds,
  nearestSlot,
  keyboardTarget,
  type Spring1D,
} from "../packages/core/src/dock/model.js";
import { segmentText } from "../packages/core/src/typography/segment.js";
import { claimStyle, styleOwner } from "../packages/core/src/style-ownership.js";
import { parseScene, serializeScene, SCENE_SCHEMA_VERSION, SCENE_MAX_ENTITIES } from "../packages/core/src/scene/schema.js";

test("proximity magnification peaks at the pointer and decays smoothly", () => {
  const opts = { maxScale: 1.8, sigma: 70 };
  assert.equal(proximityScale(0, opts), 1.8);
  assert.ok(proximityScale(35, opts) < proximityScale(0, opts));
  assert.ok(proximityScale(200, opts) < 1.02, "far items barely move");
  assert.equal(proximityScale(Number.NaN, opts), 1);
  assert.equal(proximityScale(10, { maxScale: 0.2, sigma: 70 }) >= 1, true);
});

test("spring settles to its target and never produces non-finite state", () => {
  const s: Spring1D = { value: 1, velocity: 0 };
  for (let i = 0; i < 600; i++) springStep(s, 1.8, 1 / 120, 260, 20);
  assert.ok(Math.abs(s.value - 1.8) < 1e-3, `value ${s.value}`);
  // Huge frame gaps are clamped rather than exploding.
  const wild: Spring1D = { value: 0, velocity: 0 };
  springStep(wild, 1, 10, 260, 20);
  assert.ok(Number.isFinite(wild.value) && Number.isFinite(wild.velocity));
  const bad: Spring1D = { value: Number.POSITIVE_INFINITY, velocity: 1 };
  springStep(bad, 1, 1 / 120, 260, 20);
  assert.equal(bad.value, 1);
  assert.equal(bad.velocity, 0);
});

test("reorder returns a new order and validates indices", () => {
  const order = ["a", "b", "c", "d"];
  assert.deepEqual(reorderIds(order, 0, 2), ["b", "c", "a", "d"]);
  assert.deepEqual(order, ["a", "b", "c", "d"], "input must not be mutated");
  assert.deepEqual(reorderIds(order, 3, 0), ["d", "a", "b", "c"]);
  assert.throws(() => reorderIds(order, -1, 0), RangeError);
  assert.throws(() => reorderIds(order, 0, 4), RangeError);
  assert.throws(() => reorderIds(order, 1.5, 0), TypeError);
});

test("nearest slot and keyboard navigation follow the orientation", () => {
  assert.equal(nearestSlot(95, [10, 60, 110]), 2);
  assert.equal(nearestSlot(0, []), 0);
  assert.equal(keyboardTarget(2, 3, "ArrowRight", "horizontal"), 0, "wraps forward");
  assert.equal(keyboardTarget(0, 3, "ArrowLeft", "horizontal"), 2, "wraps backward");
  assert.equal(keyboardTarget(0, 3, "ArrowDown", "horizontal"), 0, "wrong axis ignored");
  assert.equal(keyboardTarget(0, 3, "ArrowDown", "vertical"), 1);
  assert.equal(keyboardTarget(1, 3, "End", "vertical"), 2);
  assert.equal(keyboardTarget(1, 0, "ArrowDown", "vertical"), -1);
});

test("grapheme segmentation keeps emoji sequences, combining marks and CJK whole", () => {
  assert.deepEqual(segmentText("éa"), ["é", "a"]);
  assert.equal(segmentText("👨‍👩‍👧").length, 1, "ZWJ family is one grapheme");
  assert.equal(segmentText("🇨🇳🇺🇸").length, 2, "flag pairs are one grapheme each");
  assert.deepEqual(segmentText("中文"), ["中", "文"]);
  assert.equal(segmentText("").length, 0);
});

test("style ownership allows one owner per property and releases cleanly", () => {
  const el = {} as HTMLElement;
  const release = claimStyle(el, "transform", "dock#1");
  assert.equal(styleOwner(el, "transform"), "dock#1");
  assert.throws(() => claimStyle(el, "transform", "preset#2"), /already owned by "dock#1"/);
  assert.doesNotThrow(() => claimStyle(el, "translate", "preset#2"), "different property is independent");
  assert.doesNotThrow(() => claimStyle(el, "transform", "dock#1"), "same owner may re-claim");
  release();
  release();
  assert.equal(styleOwner(el, "transform"), undefined);
  claimStyle(el, "transform", "preset#2");
  assert.equal(styleOwner(el, "transform"), "preset#2");
});

const validScene = {
  schemaVersion: SCENE_SCHEMA_VERSION,
  metadata: { name: "Demo", createdWith: "lab" },
  world: { mode: "both", reducedMotion: "system" },
  entities: [
    { id: "card-1", label: "Card", presets: ["elastic", "magnetic"], strength: 0.7, mode: "both", material: { stiffness: 200 } },
  ],
  renderers: ["dom-field", "svg"],
};

test("scene schema accepts a valid document and round-trips through JSON", () => {
  const result = parseScene(JSON.parse(JSON.stringify(validScene)));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const again = parseScene(JSON.parse(serializeScene(result.scene)));
  assert.deepEqual(again, result);
});

test("scene schema reports every error with a path and rejects unsafe input", () => {
  const bad = {
    schemaVersion: 2,
    world: { mode: "warp", reducedMotion: "sometimes" },
    renderers: ["webgpu-magic"],
    entities: [
      { id: "1bad id", presets: ["eval"], strength: 3, material: { stiffness: Number.NaN, bogus: 1 } },
      { id: "dup" },
      { id: "dup" },
    ],
  };
  const result = parseScene(bad);
  assert.equal(result.ok, false);
  if (result.ok) return;
  const text = result.errors.join("\n");
  assert.match(text, /\$\.schemaVersion/);
  assert.match(text, /\$\.world\.mode/);
  assert.match(text, /renderers\[0\]/);
  assert.match(text, /entities\[0\]\.id/);
  assert.match(text, /presets\[0\]: unknown preset/);
  assert.match(text, /strength/);
  assert.match(text, /material\.stiffness/);
  assert.match(text, /material\.bogus: unknown material key/);
  assert.match(text, /duplicate id dup/);
});

test("scene schema rejects non-objects and oversize entity lists", () => {
  assert.equal(parseScene(null).ok, false);
  assert.equal(parseScene([]).ok, false);
  const entities = Array.from({ length: SCENE_MAX_ENTITIES + 1 }, (_, i) => ({ id: `e${i}` }));
  const result = parseScene({ ...validScene, entities });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.errors[0]!, /at most/);
});

test("scene schema treats prototype keys as unknown data, not as material", () => {
  const raw = JSON.parse('{"schemaVersion":1,"entities":[{"id":"x","material":{"__proto__":1,"constructor":2}}]}');
  const result = parseScene(raw);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.errors.join("\n"), /material\.__proto__: unknown material key/);
    assert.match(result.errors.join("\n"), /material\.constructor: unknown material key/);
  }
});
