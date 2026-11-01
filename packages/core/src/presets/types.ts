import type { AnimatterWorld } from "../world.js";
import type { Material } from "../types.js";

export type Disposer = () => void;

/** Conflict groups: presets in the same group compete for one physical channel. */
export type PresetGroup = "material" | "motion" | "gravity" | "field" | "depth" | "feedback";

/**
 * replace: a later preset in the same group supersedes earlier ones; removing it restores them.
 * stack: presets in the group combine; for the same key the later contribution wins.
 * reject: a second preset in an occupied group throws at install time.
 */
export type ConflictPolicy = "replace" | "stack" | "reject";

/** Partial physical material. Presets only ever contribute material values, never DOM transforms. */
export type MaterialTarget = Partial<Material>;

export interface PresetOptions extends MaterialTarget {
  /** Interpolation factor between the surface baseline and the preset target. 0 = no effect, 1 = target. Range [0, 2]. */
  strength?: number;
}

export interface PresetContext {
  readonly world: AnimatterWorld;
  readonly element: HTMLElement;
  readonly surfaceId: string;
  /** Aborted when this preset instance is uninstalled. */
  readonly signal: AbortSignal;
  /** Adds this preset's material contribution. Returns a remover; uninstall removes all contributions automatically. */
  contribute(target: MaterialTarget, strength?: number): Disposer;
}

export interface PresetDefinition {
  readonly name: string;
  readonly options: Readonly<PresetOptions>;
  readonly group: PresetGroup;
  readonly conflict: ConflictPolicy;
  /** Installs this preset on one surface. Must return a disposer and must not write DOM transforms. */
  install(context: PresetContext): Disposer;
}

export type PresetInput = PresetDefinition | readonly PresetDefinition[];

/** Accepted by world.enhance: a selector, a single element, or any iterable of elements. */
export type Target = string | HTMLElement | Iterable<HTMLElement>;

export interface EnhancementPatch {
  presets?: PresetInput;
}

export interface EnhancementHandle {
  readonly ids: readonly string[];
  update(patch: EnhancementPatch): void;
  disable(): void;
  enable(): void;
  destroy(): void;
}
