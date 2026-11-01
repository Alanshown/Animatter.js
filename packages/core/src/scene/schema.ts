import type { Material, Mode } from "../types.js";
import { materialRanges, type PresetName, presets } from "../presets/catalog.js";

/** Versioned, JSON-only scene document used by Animatter Lab import and export. */
export const SCENE_SCHEMA_VERSION = 1;
export const SCENE_MAX_ENTITIES = 200;

export const SCENE_RENDERERS = ["dom-field", "svg", "canvas", "metaball", "particles"] as const;
export type SceneRendererKind = (typeof SCENE_RENDERERS)[number];

export interface SceneEntity {
  id: string;
  label: string;
  /** Preset names from the public catalog. Unknown names are rejected. */
  presets: PresetName[];
  strength: number;
  mode: Mode;
  material: Partial<Material>;
}

export interface SceneDocument {
  schemaVersion: number;
  metadata: { name: string; createdWith: string };
  world: { mode: Mode; reducedMotion: "system" | "always" | "never" };
  entities: SceneEntity[];
  renderers: SceneRendererKind[];
}

export type SceneParseResult =
  | { ok: true; scene: SceneDocument }
  | { ok: false; errors: string[] };

const MODES: readonly Mode[] = ["field", "embodied", "both", "off"];
const REDUCED: readonly SceneDocument["world"]["reducedMotion"][] = ["system", "always", "never"];
const PRESET_NAMES = new Set<string>(Object.keys(presets));
const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Validates an untrusted JSON value. Never evaluates strings, never reads prototype keys,
 * and returns every error with a JSON path rather than stopping at the first.
 */
export function parseScene(input: unknown): SceneParseResult {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ["$: scene must be an object"] };
  if (input.schemaVersion !== SCENE_SCHEMA_VERSION)
    errors.push(`$.schemaVersion: must be ${SCENE_SCHEMA_VERSION}`);

  const metadata = isRecord(input.metadata) ? input.metadata : {};
  const name = typeof metadata.name === "string" ? metadata.name.slice(0, 120) : "Untitled";
  const createdWith = typeof metadata.createdWith === "string" ? metadata.createdWith.slice(0, 60) : "unknown";

  const world = isRecord(input.world) ? input.world : {};
  const worldMode = world.mode ?? "both";
  if (!MODES.includes(worldMode as Mode)) errors.push(`$.world.mode: must be one of ${MODES.join(", ")}`);
  const reduced = world.reducedMotion ?? "system";
  if (!REDUCED.includes(reduced as never)) errors.push("$.world.reducedMotion: invalid value");

  const renderers: SceneRendererKind[] = [];
  const rawRenderers = input.renderers ?? [];
  if (!Array.isArray(rawRenderers)) errors.push("$.renderers: must be an array");
  else
    rawRenderers.forEach((r, i) => {
      if (SCENE_RENDERERS.includes(r as SceneRendererKind)) renderers.push(r as SceneRendererKind);
      else errors.push(`$.renderers[${i}]: unknown renderer`);
    });

  const entities: SceneEntity[] = [];
  const rawEntities = input.entities ?? [];
  if (!Array.isArray(rawEntities)) errors.push("$.entities: must be an array");
  else if (rawEntities.length > SCENE_MAX_ENTITIES)
    errors.push(`$.entities: at most ${SCENE_MAX_ENTITIES} entities`);
  else {
    const seen = new Set<string>();
    rawEntities.forEach((raw, i) => {
      const at = `$.entities[${i}]`;
      if (!isRecord(raw)) return errors.push(`${at}: must be an object`);
      const id = raw.id;
      if (typeof id !== "string" || !ID_PATTERN.test(id)) errors.push(`${at}.id: invalid id`);
      else if (seen.has(id)) errors.push(`${at}.id: duplicate id ${id}`);
      else seen.add(id);
      const label = typeof raw.label === "string" ? raw.label.slice(0, 200) : "";
      const strength = raw.strength ?? 1;
      if (typeof strength !== "number" || !Number.isFinite(strength) || strength < 0 || strength > 2)
        errors.push(`${at}.strength: must be a number in [0, 2]`);
      const mode = raw.mode ?? "both";
      if (!MODES.includes(mode as Mode)) errors.push(`${at}.mode: invalid`);
      const presetList: PresetName[] = [];
      const rawPresets = raw.presets ?? [];
      if (!Array.isArray(rawPresets)) errors.push(`${at}.presets: must be an array`);
      else
        rawPresets.forEach((p, j) => {
          if (typeof p === "string" && PRESET_NAMES.has(p)) presetList.push(p as PresetName);
          else errors.push(`${at}.presets[${j}]: unknown preset`);
        });
      const material: Partial<Material> = {};
      const rawMaterial = raw.material ?? {};
      if (!isRecord(rawMaterial)) errors.push(`${at}.material: must be an object`);
      else
        for (const [key, value] of Object.entries(rawMaterial)) {
          if (!Object.prototype.hasOwnProperty.call(materialRanges, key)) {
            errors.push(`${at}.material.${key}: unknown material key`);
            continue;
          }
          const [min, max] = materialRanges[key as keyof Material];
          if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max)
            errors.push(`${at}.material.${key}: must be in [${min}, ${max}]`);
          else material[key as keyof Material] = value;
        }
      entities.push({
        id: typeof id === "string" ? id : "",
        label,
        presets: presetList,
        strength: typeof strength === "number" && Number.isFinite(strength) ? strength : 1,
        mode: (MODES.includes(mode as Mode) ? mode : "both") as Mode,
        material,
      });
    });
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    scene: {
      schemaVersion: SCENE_SCHEMA_VERSION,
      metadata: { name, createdWith },
      world: { mode: worldMode as Mode, reducedMotion: reduced as SceneDocument["world"]["reducedMotion"] },
      entities,
      renderers,
    },
  };
}

/** Serialises a scene as stable, indented JSON. Input is assumed already valid. */
export function serializeScene(scene: SceneDocument): string {
  return JSON.stringify(scene, null, 2) + "\n";
}
