import type { AnimatterWorld } from "../world.js";
import { resolveMaterial } from "../materials.js";
import type { Material } from "../types.js";
import type {
  ConflictPolicy,
  Disposer,
  EnhancementHandle,
  EnhancementPatch,
  MaterialTarget,
  PresetContext,
  PresetDefinition,
  PresetGroup,
  PresetInput,
  Target,
} from "./types.js";

interface Contribution {
  readonly owner: number;
  readonly group: PresetGroup;
  readonly conflict: ConflictPolicy;
  readonly target: MaterialTarget;
  readonly strength: number;
}

export interface SurfaceRecord {
  readonly id: string;
  readonly element: HTMLElement;
  /** True when Enhance performed the registration and must release it. */
  readonly owned: boolean;
  /** Material snapshot taken at first enhancement. */
  readonly base: Material;
  readonly contributions: Contribution[];
  refs: number;
}

export interface Installation {
  readonly controller: AbortController;
  readonly dispose: Disposer;
  readonly removers: Disposer[];
}

/** Keeps the effective material of each surface consistent with its active preset contributions. */
export class EnhancementRegistry {
  private readonly records = new Map<string, SurfaceRecord>();
  private serial = 0;
  private owners = 0;
  private closed = false;

  constructor(private readonly world: AnimatterWorld) {}

  enhance(target: Target, input: PresetInput): EnhancementHandle {
    if (this.closed) throw new Error("World is destroyed");
    const presets = normalizePresets(input);
    const elements = resolveTargets(this.world, target);
    const records: SurfaceRecord[] = [];
    try {
      for (const element of elements) records.push(this.acquire(element));
    } catch (error) {
      for (const record of records) this.release(record);
      throw error;
    }
    return new Handle(this, records, presets);
  }

  /** Install one preset on one surface. Called by Handle. */
  install(record: SurfaceRecord, preset: PresetDefinition): Installation {
    const owner = ++this.owners;
    const controller = new AbortController();
    const removers: Disposer[] = [];
    const context: PresetContext = {
      world: this.world,
      element: record.element,
      surfaceId: record.id,
      signal: controller.signal,
      contribute: (target, strength = 1) => {
        const remove = this.add(record, {
          owner,
          group: preset.group,
          conflict: preset.conflict,
          target,
          strength: clamp(strength, 0, 2),
        });
        removers.push(remove);
        return remove;
      },
    };
    let dispose: Disposer;
    try {
      dispose = preset.install(context);
    } catch (error) {
      controller.abort();
      for (const remove of removers) remove();
      throw error;
    }
    return { controller, dispose, removers };
  }

  uninstall(installation: Installation): void {
    installation.controller.abort();
    try {
      installation.dispose();
    } finally {
      for (const remove of installation.removers) remove();
    }
  }

  /** Called on world.destroy. The world is already dead, so no configure calls are made. */
  close(): void {
    this.closed = true;
    this.records.clear();
  }

  private acquire(element: HTMLElement): SurfaceRecord {
    const existing = [...this.world.spatial.surfaces.values()].find(
      (surface) => surface.element === element,
    );
    let record: SurfaceRecord | undefined;
    if (existing) {
      record = this.records.get(existing.id);
      if (!record) {
        record = {
          id: existing.id,
          element,
          owned: false,
          base: resolveMaterial(existing.options.material),
          contributions: [],
          refs: 0,
        };
        this.records.set(record.id, record);
      }
    } else {
      let id: string;
      do id = `am-enhance-${++this.serial}`;
      while (this.world.spatial.surfaces.has(id));
      this.world.register(element, { id });
      const surface = this.world.spatial.surfaces.get(id)!;
      record = {
        id,
        element,
        owned: true,
        base: resolveMaterial(surface.options.material),
        contributions: [],
        refs: 0,
      };
      this.records.set(id, record);
    }
    record.refs++;
    return record;
  }

  release(record: SurfaceRecord): void {
    if (this.closed) return;
    record.refs--;
    if (record.refs > 0) return;
    this.records.delete(record.id);
    if (record.owned && this.world.spatial.surfaces.has(record.id))
      this.world.unregister(record.id);
  }

  private add(record: SurfaceRecord, contribution: Contribution): Disposer {
    if (this.records.get(record.id) !== record)
      throw new Error(`Surface ${record.id} is no longer enhanced`);
    if (contribution.conflict === "reject" && record.contributions.some((c) => c.group === contribution.group))
      throw new Error(`Preset group "${contribution.group}" is already occupied on ${record.id}`);
    record.contributions.push(contribution);
    this.apply(record);
    let removed = false;
    return () => {
      if (removed) return;
      removed = true;
      const index = record.contributions.indexOf(contribution);
      if (index === -1) return;
      record.contributions.splice(index, 1);
      if (this.records.get(record.id) === record) this.apply(record);
    };
  }

  private apply(record: SurfaceRecord): void {
    if (!this.world.spatial.surfaces.has(record.id)) return;
    const lastReplace = new Map<PresetGroup, Contribution>();
    for (const c of record.contributions)
      if (c.conflict === "replace") lastReplace.set(c.group, c);
    const material: Material = { ...record.base };
    for (const c of record.contributions) {
      if (c.conflict === "replace" && lastReplace.get(c.group) !== c) continue;
      for (const key of Object.keys(c.target) as (keyof Material)[]) {
        const from = record.base[key];
        const to = c.target[key] as number;
        material[key] = from + (to - from) * c.strength;
      }
    }
    this.world.configure(record.id, { material: resolveMaterial(material) });
  }
}

class Handle implements EnhancementHandle {
  readonly ids: readonly string[];
  private installations = new Map<string, { preset: PresetDefinition; surface: SurfaceRecord; installation: Installation }>();
  private presets: PresetDefinition[];
  private enabled = true;
  private destroyed = false;

  constructor(
    private readonly registry: EnhancementRegistry,
    private readonly records: SurfaceRecord[],
    presets: PresetDefinition[],
  ) {
    this.ids = records.map((record) => record.id);
    this.presets = presets;
    this.sync();
  }

  update(patch: EnhancementPatch): void {
    this.assertAlive();
    if (patch.presets !== undefined) {
      this.presets = normalizePresets(patch.presets);
      if (this.enabled) this.sync();
    }
  }

  disable(): void {
    if (this.destroyed || !this.enabled) return;
    this.enabled = false;
    this.teardown();
  }

  enable(): void {
    this.assertAlive();
    if (this.enabled) return;
    this.enabled = true;
    this.sync();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.teardown();
    this.destroyed = true;
    for (const record of this.records) this.registry.release(record);
  }

  /** Reconciles installed preset instances with the desired list. Unchanged presets are not reinstalled. */
  private sync(): void {
    const desired = new Map<string, { preset: PresetDefinition; surface: SurfaceRecord }>();
    for (const surface of this.records)
      this.presets.forEach((preset, index) => {
        const key = `${surface.id}|${index}|${preset.name}|${JSON.stringify(preset.options)}`;
        desired.set(key, { preset, surface });
      });
    for (const [key, entry] of [...this.installations]) {
      if (desired.has(key)) continue;
      this.registry.uninstall(entry.installation);
      this.installations.delete(key);
    }
    for (const [key, { preset, surface }] of desired) {
      if (this.installations.has(key)) continue;
      const installation = this.registry.install(surface, preset);
      this.installations.set(key, { preset, surface, installation });
    }
  }

  private teardown(): void {
    for (const entry of this.installations.values())
      this.registry.uninstall(entry.installation);
    this.installations.clear();
  }

  private assertAlive(): void {
    if (this.destroyed) throw new Error("Enhancement handle is destroyed");
  }
}

export function normalizePresets(input: PresetInput): PresetDefinition[] {
  const list = (Array.isArray(input) ? input : [input]) as readonly PresetDefinition[];
  if (list.length === 0) throw new TypeError("At least one preset is required");
  for (const preset of list)
    if (!preset || typeof preset.name !== "string" || typeof preset.install !== "function")
      throw new TypeError("Invalid preset definition");
  return [...list];
}

/** Resolves a Target without touching DOM globals, so the logic runs under node tests. */
export function resolveTargets(world: AnimatterWorld, target: Target): HTMLElement[] {
  if (typeof target === "string") return [...world.root.querySelectorAll<HTMLElement>(target)];
  if (Symbol.iterator in Object(target) && typeof (target as Iterable<HTMLElement>)[Symbol.iterator] === "function")
    return [...new Set([...(target as Iterable<HTMLElement>)])];
  return [target as HTMLElement];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
