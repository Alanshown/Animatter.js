import { vec, type Vec3 } from "../types.js";
import type { Body } from "./engine.js";
import type { Surface } from "../spatial/registry.js";
export interface FieldContext {
  body: Readonly<Body>;
  surface: Readonly<Surface>;
  point: Readonly<Vec3>;
  velocity: Readonly<Vec3>;
  active: boolean;
  time: number;
}
export interface ForceField {
  id: string;
  sample(context: FieldContext): Partial<Vec3>;
}
/** Radial inverse-distance response with a finite center, useful for attract/repel zones. */
export function radialField(
  id: string,
  strength = 140,
  radius = 300,
): ForceField {
  return {
    id,
    sample({ body, surface, point, active }) {
      if (!active) return vec();
      const dx = point.x - surface.anchors.center.x - body.position.x,
        dy = point.y - surface.anchors.center.y - body.position.y,
        d = Math.hypot(dx, dy);
      if (d > radius) return vec();
      const f = (strength * (1 - d / radius)) / Math.max(24, d);
      return vec(dx * f, dy * f);
    },
  };
}
/** Tangential force, bounded radial restoring force, and pointer-speed response. */
export function orbitalField(
  id: string,
  strength = 180,
  radius = 340,
): ForceField {
  return {
    id,
    sample({ body, surface, point, velocity, active }) {
      if (!active) return vec();
      const dx = surface.anchors.center.x + body.position.x - point.x,
        dy = surface.anchors.center.y + body.position.y - point.y,
        d = Math.hypot(dx, dy);
      if (d > radius || d < 1) return vec();
      const falloff = 1 - d / radius,
        speed = 1 + Math.min(0.5, Math.hypot(velocity.x, velocity.y) / 4000);
      return vec(
        (-dy / d) * strength * falloff * speed,
        (dx / d) * strength * falloff * speed,
      );
    },
  };
}
