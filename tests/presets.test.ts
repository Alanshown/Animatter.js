import { test } from "node:test";
import assert from "node:assert/strict";
import { EnhancementRegistry } from "../packages/core/src/presets/enhance.js";
import { presets, definePreset, registerPreset, getPresetFactory } from "../packages/core/src/presets/catalog.js";
import { parseDeclarative, scanPresets } from "../packages/core/src/presets/declarative.js";
import { materials } from "../packages/core/src/materials.js";
import type { Material } from "../packages/core/src/types.js";

type Listener = (event: { type: string; target: string | null }) => void;

/** Minimal world double. It implements only the members the enhance layer uses. */
function fakeWorld() {
  const surfaces = new Map<string, { id: string; element: unknown; options: { material: Material; collision?: boolean } }>();
  const listeners = new Set<Listener>();
  const log = { registers: 0, unregisters: 0, configures: 0 };
  const elements: unknown[] = [];
  const world = {
    root: {
      querySelectorAll(selector: string) {
        return elements.filter((el) => (el as { match: string }).match === selector);
      },
    },
    spatial: { surfaces },
    register(element: unknown, options: { id?: string } = {}) {
      log.registers++;
      const id = options.id ?? `auto-${log.registers}`;
      surfaces.set(id, { id, element, options: { material: { ...materials.elastic! } } });
      return () => world.unregister(id);
    },
    unregister(id: string) {
      log.unregisters++;
      surfaces.delete(id);
    },
    configure(id: string, patch: { material?: Partial<Material>; collision?: boolean }) {
      log.configures++;
      const s = surfaces.get(id);
      if (!s) throw new Error(`Unknown surface: ${id}`);
      s.options = {
        ...s.options,
        ...patch,
        material: { ...s.options.material, ...patch.material } as Material,
      };
    },
    on(listener: Listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(event: { type: string; target: string | null }) {
      for (const listener of [...listeners]) listener(event);
    },
  };
  return { world, surfaces, log };
}

/** Element double whose style writes throw, proving presets never touch DOM transforms. */
function fakeElement(id: string, attrs: Record<string, string> = {}) {
  const style = new Proxy(
    {},
    {
      set() {
        throw new Error("Presets must not write element style");
      },
    },
  );
  return {
    id,
    style,
    match: "[data-am-preset],[data-am-material]",
    getAttribute: (name: string) => attrs[name] ?? null,
  };
}

const base = materials.elastic!;

test("enhance registers an unregistered element once and releases it with the last handle", () => {
  const { world, log, surfaces } = fakeWorld();
  const reg = new EnhancementRegistry(world as never);
  const el = fakeElement("a") as unknown as HTMLElement;
  const first = reg.enhance(el, presets.elastic());
  const second = reg.enhance(el, presets.snap());
  assert.equal(log.registers, 1, "one registration per element");
  assert.equal(first.ids[0], second.ids[0]);
  first.destroy();
  assert.equal(surfaces.size, 1, "still held by the second handle");
  second.destroy();
  assert.equal(surfaces.size, 0, "released after the last handle");
});

test("developer-registered surfaces are reused and never unregistered by enhance", () => {
  const { world, log, surfaces } = fakeWorld();
  const reg = new EnhancementRegistry(world as never);
  const el = fakeElement("b") as unknown as HTMLElement;
  world.register(el, { id: "manual" });
  const handle = reg.enhance(el, presets.elastic());
  assert.deepEqual(handle.ids, ["manual"]);
  handle.destroy();
  assert.equal(log.registers, 1);
  assert.equal(log.unregisters, 0);
  assert.equal(surfaces.has("manual"), true);
});

test("replace-group presets supersede each other and restore the earlier one on removal", () => {
  const { world, surfaces } = fakeWorld();
  const reg = new EnhancementRegistry(world as never);
  const el = fakeElement("c") as unknown as HTMLElement;
  const elastic = reg.enhance(el, presets.elastic());
  const id = elastic.ids[0]!;
  assert.equal(surfaces.get(id)!.options.material.stiffness, 150);
  const snap = reg.enhance(el, presets.snap());
  assert.equal(surfaces.get(id)!.options.material.stiffness, 320);
  snap.destroy();
  assert.equal(surfaces.get(id)!.options.material.stiffness, 150, "elastic restored");
  elastic.destroy();
  assert.equal(surfaces.has(id), false, "owned surface released after the last handle");
});

test("stack-group presets combine and the later value wins per key", () => {
  const { world, surfaces } = fakeWorld();
  const reg = new EnhancementRegistry(world as never);
  const el = fakeElement("d") as unknown as HTMLElement;
  const handle = reg.enhance(el, [presets.float(), presets.tilt()]);
  const material = surfaces.get(handle.ids[0]!)!.options.material;
  assert.equal(material.softness, 0.8, "tilt softness applied");
  assert.equal(material.depth, 14, "later depth overrides float");
  handle.destroy();
});

test("strength interpolates between the baseline and the preset target", () => {
  const { world, surfaces } = fakeWorld();
  const reg = new EnhancementRegistry(world as never);
  const el = fakeElement("e") as unknown as HTMLElement;
  const handle = reg.enhance(el, presets.elastic({ strength: 0.5, stiffness: 250 }));
  const stiffness = surfaces.get(handle.ids[0]!)!.options.material.stiffness;
  assert.equal(stiffness, base.stiffness + (250 - base.stiffness) * 0.5);
  handle.destroy();
});

test("update with the same presets does not reinstall or re-register", () => {
  const { world, log } = fakeWorld();
  const reg = new EnhancementRegistry(world as never);
  const el = fakeElement("f") as unknown as HTMLElement;
  const handle = reg.enhance(el, presets.elastic());
  const configuresBefore = log.configures;
  handle.update({ presets: presets.elastic() });
  assert.equal(log.registers, 1);
  assert.equal(log.configures, configuresBefore, "unchanged preset is not reapplied");
  handle.update({ presets: presets.elastic({ stiffness: 200 }) });
  assert.equal(log.registers, 1, "changed options still do not re-register the surface");
  handle.destroy();
});

test("disable and enable restore and reapply the material without re-registering", () => {
  const { world, surfaces, log } = fakeWorld();
  const reg = new EnhancementRegistry(world as never);
  const el = fakeElement("g") as unknown as HTMLElement;
  const handle = reg.enhance(el, presets.snap());
  const id = handle.ids[0]!;
  handle.disable();
  assert.equal(surfaces.get(id)!.options.material.stiffness, base.stiffness);
  handle.enable();
  assert.equal(surfaces.get(id)!.options.material.stiffness, 320);
  assert.equal(log.registers, 1);
  handle.destroy();
  assert.throws(() => handle.update({ presets: presets.snap() }), /destroyed/);
});

test("reject-group conflicts throw and leave no partial contribution", () => {
  const { world, surfaces } = fakeWorld();
  const reg = new EnhancementRegistry(world as never);
  const el = fakeElement("h") as unknown as HTMLElement;
  const strict = definePreset({ name: "strictOne", group: "field", conflict: "reject", defaults: { magnetism: 10 } });
  const first = reg.enhance(el, strict());
  const id = first.ids[0]!;
  assert.throws(() => reg.enhance(el, [strict(), presets.magnetic()]), /occupied/);
  assert.equal(surfaces.get(id)!.options.material.magnetism, 10);
  first.destroy();
});

test("a preset whose install throws rolls back its contributions", () => {
  const { world, surfaces } = fakeWorld();
  const reg = new EnhancementRegistry(world as never);
  const el = fakeElement("i") as unknown as HTMLElement;
  const broken = {
    name: "broken",
    options: Object.freeze({ strength: 1 }),
    group: "depth" as const,
    conflict: "stack" as const,
    install(ctx: { contribute(t: Partial<Material>): () => void }) {
      ctx.contribute({ depth: 99 });
      throw new Error("boom");
    },
  };
  assert.throws(() => reg.enhance(el, broken), /boom/);
  const handle = reg.enhance(el, presets.elastic());
  assert.equal(surfaces.get(handle.ids[0]!)!.options.material.depth, base.depth);
  handle.destroy();
});

test("hover lift applies only to its own surface's enter and leave events", () => {
  const { world, surfaces } = fakeWorld();
  const reg = new EnhancementRegistry(world as never);
  const el = fakeElement("j") as unknown as HTMLElement;
  const handle = reg.enhance(el, presets.hoverLift());
  const id = handle.ids[0]!;
  world.emit({ type: "enter", target: "other" });
  assert.equal(surfaces.get(id)!.options.material.depth, base.depth);
  world.emit({ type: "enter", target: id });
  assert.equal(surfaces.get(id)!.options.material.depth, 36);
  world.emit({ type: "leave", target: id });
  assert.equal(surfaces.get(id)!.options.material.depth, base.depth);
  handle.destroy();
});

test("collision feedback enables collision and restores the previous value", () => {
  const { world, surfaces } = fakeWorld();
  const reg = new EnhancementRegistry(world as never);
  const el = fakeElement("k") as unknown as HTMLElement;
  const handle = reg.enhance(el, presets.collisionFeedback());
  const id = handle.ids[0]!;
  assert.equal(surfaces.get(id)!.options.collision, true);
  handle.destroy();
  assert.equal(surfaces.get(id), undefined, "owned surface released on destroy");
});

test("presets reject invalid options and never write DOM style", () => {
  assert.throws(() => presets.elastic({ strength: 3 }), /strength/);
  assert.throws(() => presets.elastic({ stiffnes: 1 } as never), /unknown option/);
  assert.throws(() => presets.elastic({ stiffness: -1 }), /must be in/);
  const { world } = fakeWorld();
  const reg = new EnhancementRegistry(world as never);
  const el = fakeElement("l") as unknown as HTMLElement;
  const handle = reg.enhance(el, [presets.float(), presets.dragFeedback(), presets.ripple()]);
  handle.destroy();
});

test("the preset registry rejects duplicate and malformed names", () => {
  assert.ok(getPresetFactory("elastic"));
  assert.equal(getPresetFactory("nope"), undefined);
  assert.throws(() => registerPreset("elastic", presets.elastic), /Duplicate/);
  assert.throws(() => registerPreset("Bad Name", presets.elastic), /Invalid preset name/);
});

test("declarative attributes parse with validation and never evaluate strings", () => {
  const spec = parseDeclarative({
    getAttribute: (name) =>
      ({ "data-am-preset": "elastic  magnetic", "data-am-strength": "0.7", "data-am-material": "liquid" })[name] ?? null,
  });
  assert.ok(spec);
  assert.deepEqual(
    spec!.presets.map((p) => p.name),
    ["material:liquid", "elastic", "magnetic"],
  );
  assert.equal(spec!.presets[1]!.options.strength, 0.7);
  assert.equal(parseDeclarative({ getAttribute: () => null }), null);
  assert.throws(() => parseDeclarative({ getAttribute: (n) => (n === "data-am-preset" ? "alert(1)" : null) }), /Unknown/);
  const withStrength = (value: string) => ({ getAttribute: (n: string) => ({ "data-am-preset": "elastic", "data-am-strength": value })[n] ?? null });
  assert.throws(() => parseDeclarative(withStrength("9")), /[0, 2]/);
  assert.throws(() => parseDeclarative(withStrength("1e3")), /Invalid data-am-strength/);
  assert.throws(() => parseDeclarative({ getAttribute: (n) => (n === "data-am-material" ? "rubber" : null) }), /Unknown/);
});

test("explicit scan enhances each element once and cleanup destroys only its own handles", () => {
  const { world, surfaces } = fakeWorld();
  const a = fakeElement("s1", { "data-am-preset": "elastic" });
  const b = fakeElement("s2", { "data-am-preset": "nope" });
  const c = fakeElement("s3", { "data-am-preset": "snap" });
  (world as unknown as { root: unknown }).root = {
    querySelectorAll: () => [a, b, c],
  };
  const errors: unknown[] = [];
  const reg = new EnhancementRegistry(world as never);
  // Expose enhance on the double so scanPresets can call it the way AnimatterWorld does.
  const shim = Object.assign(world, {
    enhance: (target: unknown, input: unknown) => reg.enhance(target as HTMLElement, input as never),
  });
  const cleanup = scanPresets(shim as never, undefined, (error) => errors.push(error));
  assert.equal(errors.length, 1, "unknown preset reported without aborting the scan");
  const again = scanPresets(shim as never, undefined, (error) => errors.push(error));
  assert.equal(errors.length, 2, "second scan retries only the still-broken element");
  assert.equal(surfaces.size, 2, "two valid elements enhanced");
  cleanup();
  again();
  assert.equal(surfaces.size, 0);
});
