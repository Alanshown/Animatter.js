import type { Material } from "./types.js";
export const materials: Readonly<Record<string, Readonly<Material>>> =
  Object.freeze({
    elastic: Object.freeze({
      mass: 1,
      stiffness: 150,
      damping: 16,
      restitution: 0.58,
      magnetism: 34,
      radius: 220,
      maxDisplacement: 34,
      depth: 12,
      softness: 0.2,
      gravity: 0,
    }),
    liquid: Object.freeze({
      mass: 1.4,
      stiffness: 85,
      damping: 11,
      restitution: 0.4,
      magnetism: 48,
      radius: 280,
      maxDisplacement: 38,
      depth: 18,
      softness: 0.85,
      gravity: 0,
    }),
    heavy: Object.freeze({
      mass: 3,
      stiffness: 190,
      damping: 34,
      restitution: 0.28,
      magnetism: 16,
      radius: 180,
      maxDisplacement: 48,
      depth: 7,
      softness: 0.08,
      gravity: 90,
    }),
    magnetic: Object.freeze({
      mass: 0.8,
      stiffness: 130,
      damping: 14,
      restitution: 0.65,
      magnetism: 100,
      radius: 300,
      maxDisplacement: 55,
      depth: 22,
      softness: 0.15,
      gravity: 0,
    }),
  });
export function resolveMaterial(
  patch: Partial<Material> = {},
  base = materials.elastic!,
): Material {
  const result = { ...base, ...patch };
  for (const [key, value] of Object.entries(result))
    if (!Number.isFinite(value)) throw new TypeError(`Invalid material ${key}`);
  if (
    result.mass <= 0 ||
    result.stiffness < 0 ||
    result.damping < 0 ||
    result.radius <= 0 ||
    result.maxDisplacement < 0 ||
    result.depth < 0 ||
    result.restitution < 0 ||
    result.restitution > 1 ||
    result.softness < 0 ||
    result.softness > 1
  )
    throw new RangeError("Invalid material range");
  return result;
}
