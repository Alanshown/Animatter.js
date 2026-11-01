import type { Intent } from "../types.js";
import type {
  ConflictPolicy,
  Disposer,
  MaterialTarget,
  PresetContext,
  PresetDefinition,
  PresetGroup,
  PresetOptions,
} from "./types.js";

/** Valid numeric ranges for every material key a preset may contribute. */
export const materialRanges: Readonly<Record<keyof MaterialTarget, readonly [number, number]>> = {
  mass: [0.05, 20],
  stiffness: [0, 2000],
  damping: [0, 500],
  restitution: [0, 1],
  magnetism: [0, 500],
  radius: [0.1, 2000],
  maxDisplacement: [0, 1000],
  depth: [0, 500],
  softness: [0, 1],
  gravity: [-5, 5],
};

export interface PresetSpec {
  name: string;
  group: PresetGroup;
  conflict?: ConflictPolicy;
  /** Default material target. Keys omitted here are untouched. */
  defaults: MaterialTarget;
  /** When set, the material contribution is active only between these two semantic events on the surface. */
  activeOn?: { start: Intent; end: Intent };
  /** Optional extra behaviour, e.g. configuring collision. Returns a disposer. */
  setup?: (context: PresetContext) => Disposer | void;
}

const hasOwn = (object: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(object, key);

/** Validates user options: strength in [0, 2], known material keys, finite values in range. */
export function validatePresetOptions(name: string, options: PresetOptions): PresetOptions {
  const result: PresetOptions = {};
  for (const [key, value] of Object.entries(options)) {
    if (key === "strength") {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 2)
        throw new RangeError(`Preset "${name}" strength must be a finite number in [0, 2]`);
      result.strength = value;
      continue;
    }
    if (!hasOwn(materialRanges, key))
      throw new TypeError(`Preset "${name}" has unknown option "${key}"`);
    const [min, max] = materialRanges[key as keyof MaterialTarget];
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max)
      throw new RangeError(`Preset "${name}" option "${key}" must be in [${min}, ${max}]`);
    (result as Record<string, number>)[key] = value;
  }
  return result;
}

/** Builds a preset factory. Used by the built-in catalog and available to applications. */
export function definePreset(spec: PresetSpec): (options?: PresetOptions) => PresetDefinition {
  const conflict = spec.conflict ?? (spec.group === "depth" || spec.group === "feedback" ? "stack" : "replace");
  return (options = {}) => {
    const user = validatePresetOptions(spec.name, options);
    const { strength = 1, ...overrides } = user;
    const target: MaterialTarget = { ...spec.defaults, ...overrides };
    const resolved = Object.freeze({ strength, ...target });
    return Object.freeze({
      name: spec.name,
      options: resolved,
      group: spec.group,
      conflict,
      install(context: PresetContext): Disposer {
        const removers: Disposer[] = [];
        const dispose: Disposer[] = [];
        try {
          const active = (): void => {
            removers.push(context.contribute(target, strength));
          };
          if (spec.activeOn) {
            const { start, end } = spec.activeOn;
            let current: Disposer | undefined;
            const off = context.world.on((event) => {
              if (event.target !== context.surfaceId) return;
              if (event.type === start && !current) {
                current = context.contribute(target, strength);
              } else if (event.type === end && current) {
                current();
                current = undefined;
              }
            });
            dispose.push(off, () => current?.());
          } else {
            active();
          }
          const extra = spec.setup?.(context);
          if (extra) dispose.push(extra);
        } catch (error) {
          for (const remove of removers) remove();
          for (const cleanup of dispose) cleanup();
          throw error;
        }
        return () => {
          for (const cleanup of dispose.reverse()) cleanup();
          for (const remove of removers) remove();
        };
      },
    });
  };
}

export const presets = {
  /** Spring back toward the rest position with a lively overshoot. */
  elastic: definePreset({
    name: "elastic",
    group: "motion",
    defaults: { stiffness: 240, damping: 10, restitution: 0.72 },
  }),
  /** Fast, damped settle. Good for controls that should land decisively. */
  snap: definePreset({
    name: "snap",
    group: "motion",
    defaults: { stiffness: 320, damping: 34, restitution: 0.1 },
  }),
  /** Heavier body with lower damping; glides after release. */
  inertia: definePreset({
    name: "inertia",
    group: "motion",
    defaults: { mass: 2.5, damping: 6, restitution: 0.3 },
  }),
  /** Soft spring that lags behind the pointer and is pulled toward it. */
  springFollow: definePreset({
    name: "springFollow",
    group: "motion",
    defaults: { stiffness: 55, damping: 12, magnetism: 48, radius: 260 },
  }),
  /** Pointer attraction inside a radius. Field-channel only. */
  magnetic: definePreset({
    name: "magnetic",
    group: "field",
    defaults: { magnetism: 60, radius: 200 },
  }),
  /** Downward pull on the surface. */
  gravity: definePreset({
    name: "gravity",
    group: "gravity",
    defaults: { gravity: 0.6 },
  }),
  /** Increases depth travel and softness so the surface reads as hovering over the page. No periodic oscillator. */
  float: definePreset({
    name: "float",
    group: "depth",
    defaults: { depth: 24, softness: 0.6 },
  }),
  /** Raises softness so the existing velocity-driven tilt and squash respond more strongly. Tilt angle formula is fixed by FieldRenderer. */
  tilt: definePreset({
    name: "tilt",
    group: "depth",
    defaults: { softness: 0.8, depth: 14 },
  }),
  /** Raises depth while hovered; restored on leave. */
  hoverLift: definePreset({
    name: "hoverLift",
    group: "depth",
    defaults: { depth: 36 },
    activeOn: { start: "enter", end: "leave" },
  }),
  /** Increases damping while the surface is dragged; restored on dragend. */
  dragFeedback: definePreset({
    name: "dragFeedback",
    group: "feedback",
    defaults: { damping: 26, softness: 0.5 },
    activeOn: { start: "dragstart", end: "dragend" },
  }),
  /** Enables physics collision for the surface and raises restitution. */
  collisionFeedback: definePreset({
    name: "collisionFeedback",
    group: "feedback",
    defaults: { restitution: 0.75 },
    setup: ({ world, surfaceId }) => {
      const surface = world.spatial.surfaces.get(surfaceId);
      const previous = surface?.options.collision ?? false;
      world.configure(surfaceId, { collision: true });
      return () => world.configure(surfaceId, { collision: previous });
    },
  }),
  /** Shortens the settle after a click so the click ripple (FieldRenderer --am-ripple) reads cleanly. */
  ripple: definePreset({
    name: "ripple",
    group: "feedback",
    defaults: { damping: 22 },
  }),
} as const;

export type PresetName = keyof typeof presets;

/** Named registry used by declarative data-am-preset lookups. Built-ins plus applications' own presets. */
const registry = new Map<string, (options?: PresetOptions) => PresetDefinition>(
  Object.entries(presets).map(([name, factory]) => [name, factory]),
);

export function registerPreset(name: string, factory: (options?: PresetOptions) => PresetDefinition): void {
  if (!/^[a-z][A-Za-z0-9-]*$/.test(name)) throw new TypeError(`Invalid preset name "${name}"`);
  if (registry.has(name)) throw new Error(`Duplicate preset: ${name}`);
  registry.set(name, factory);
}

export function getPresetFactory(name: string): ((options?: PresetOptions) => PresetDefinition) | undefined {
  return registry.get(name);
}

export function presetNames(): string[] {
  return [...registry.keys()];
}
