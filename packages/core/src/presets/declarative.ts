import type { AnimatterWorld } from "../world.js";
import { materials } from "../materials.js";
import type { Material } from "../types.js";
import { definePreset, getPresetFactory } from "./catalog.js";
import type { EnhancementHandle, PresetDefinition } from "./types.js";

export const declarativeSelector = "[data-am-preset],[data-am-material]";

export interface DeclarativeSpec {
  readonly presets: PresetDefinition[];
}

export type DeclarativeErrorHandler = (error: unknown, element: HTMLElement) => void;

const numberPattern = /^(?:\d+|\d*\.\d+)$/;

/**
 * Parses data-am-preset, data-am-strength and data-am-material. Validates every token; never evaluates
 * attribute values. Returns null when the element carries none of the attributes.
 */
export function parseDeclarative(element: { getAttribute(name: string): string | null }): DeclarativeSpec | null {
  const presetAttr = element.getAttribute("data-am-preset");
  const strengthAttr = element.getAttribute("data-am-strength");
  const materialAttr = element.getAttribute("data-am-material");
  if (presetAttr === null && materialAttr === null) return null;
  if (strengthAttr !== null && !numberPattern.test(strengthAttr.trim()))
    throw new TypeError(`Invalid data-am-strength "${strengthAttr}"`);
  const strength = strengthAttr === null ? undefined : Number(strengthAttr.trim());
  if (strength !== undefined && strength > 2) throw new RangeError("data-am-strength must be in [0, 2]");

  const presets: PresetDefinition[] = [];
  if (materialAttr !== null) {
    const name = materialAttr.trim();
    if (!Object.hasOwn(materials, name)) throw new TypeError(`Unknown data-am-material "${name}"`);
    const material: Material = materials[name]!;
    presets.push(
      definePreset({ name: `material:${name}`, group: "material", defaults: material })({}),
    );
  }
  for (const token of (presetAttr ?? "").split(/\s+/).filter(Boolean)) {
    const factory = getPresetFactory(token);
    if (!factory) throw new TypeError(`Unknown data-am-preset "${token}"`);
    presets.push(factory(strength === undefined ? {} : { strength }));
  }
  return { presets };
}

const bound = new WeakMap<AnimatterWorld, Map<HTMLElement, EnhancementHandle>>();

/**
 * Explicit scan: enhances every matching element that is not already bound. Does not observe DOM mutations.
 * Returns a cleanup that destroys only the handles this scan created.
 */
export function scanPresets(
  world: AnimatterWorld,
  selector: string = declarativeSelector,
  onError: DeclarativeErrorHandler = (error) => console.error(error),
): () => void {
  let map = bound.get(world);
  if (!map) {
    map = new Map();
    bound.set(world, map);
  }
  const created: HTMLElement[] = [];
  for (const element of world.root.querySelectorAll<HTMLElement>(selector)) {
    if (map.has(element)) continue;
    try {
      const spec = parseDeclarative(element);
      if (!spec) continue;
      map.set(element, world.enhance(element, spec.presets));
      created.push(element);
    } catch (error) {
      onError(error, element);
    }
  }
  return () => {
    for (const element of created) {
      map.get(element)?.destroy();
      map.delete(element);
    }
  };
}
